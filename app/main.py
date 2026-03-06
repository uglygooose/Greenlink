# app/main.py
from __future__ import annotations

import os
import time
import uuid

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Response
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import ResponseValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.requests import Request

from app import crud, models, schemas
from app.auth import get_db
from app.database import DB_INFO, DB_SOURCE, Base, engine
from app.demo_seed import seed_demo_if_enabled
from app.migrations import run_auto_migrations
from app.observability import ROUTE_METRICS, log_event
from app.platform_bootstrap import ensure_platform_ready
from app.rate_limit import (
    IMPORT_RATE_LIMITER,
    LOGIN_RATE_LIMITER,
    SIGNUP_RATE_LIMITER,
    client_ip_from_request,
    normalize_identity,
)
from app.routers import (
    admin,
    cashbook,
    checkin,
    imports,
    profile,
    public,
    scoring,
    settings,
    super_admin,
    tee,
    users,
)
from app.static_files import FrontendStaticFiles

APP_STARTED_MONOTONIC = time.monotonic()


def _parse_csv_env(key: str, default: list[str]) -> list[str]:
    raw = os.getenv(key)
    if raw is None:
        return list(default)
    values = [v.strip() for v in str(raw).split(",") if v.strip()]
    return values or list(default)


def _error_payload(detail: str, request: Request) -> dict:
    request_id = getattr(getattr(request, "state", None), "request_id", None)
    payload: dict = {"detail": detail}
    if request_id:
        payload["request_id"] = request_id
    return payload


def _cors_origins() -> list[str]:
    defaults = [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    return _parse_csv_env("CORS_ALLOW_ORIGINS", defaults)


def _request_route_label(request: Request) -> str:
    try:
        route = request.scope.get("route")
        path = getattr(route, "path", None)
        if path:
            return str(path)
    except Exception:
        pass
    return str(getattr(request.url, "path", "/") or "/")


# -----------------------------------------
# Create app instance
# -----------------------------------------
app = FastAPI(title="GreenLink MVP")
app.state.startup_diagnostics = {
    "status": "booting",
    "schema": {},
    "platform": {},
    "errors": [],
}

trusted_hosts = _parse_csv_env("TRUSTED_HOSTS", ["*"])
if trusted_hosts and trusted_hosts != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)

app.add_middleware(GZipMiddleware, minimum_size=512)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Club-Id", "X-Request-ID"],
    expose_headers=["X-Request-ID", "Retry-After"],
    allow_credentials=False,
)

_STARTUP_GUARD_ALLOW_PATHS = {
    "/health",
    "/metrics",
    "/api/public/platform-state",
    "/favicon.ico",
}
_STARTUP_GUARD_ALLOW_PREFIXES = (
    "/frontend",
    "/api/public/club",
)


@app.middleware("http")
async def request_context_and_security_headers(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    request.state.request_id = request_id
    started = time.perf_counter()
    response = None
    status_code = 500
    route_label = _request_route_label(request)

    try:
        response = await call_next(request)
        status_code = int(getattr(response, "status_code", 200) or 200)
        return response
    except Exception as exc:
        log_event(
            "error",
            "http.request_failed",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            route=route_label,
            error_type=type(exc).__name__,
            error=str(exc)[:240],
        )
        raise
    finally:
        duration_ms = int((time.perf_counter() - started) * 1000)
        ROUTE_METRICS.record(request.method, route_label, status_code, duration_ms)
        log_event(
            "info",
            "http.request",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            route=route_label,
            status_code=status_code,
            duration_ms=duration_ms,
            client_ip=client_ip_from_request(request),
        )

        if response is not None:
            response.headers.setdefault("X-Request-ID", request_id)
            response.headers.setdefault("X-Response-Time-ms", str(max(duration_ms, 0)))
            response.headers.setdefault("X-Content-Type-Options", "nosniff")
            response.headers.setdefault("X-Frame-Options", "DENY")
            response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
            response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
            response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
            if request.url.scheme == "https":
                response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")


@app.middleware("http")
async def startup_guard(request: Request, call_next):
    diagnostics = getattr(request.app.state, "startup_diagnostics", {}) or {}
    status = str(diagnostics.get("status") or "").strip().lower()
    if status != "failed":
        return await call_next(request)

    path = str(getattr(request.url, "path", "") or "")
    if path in _STARTUP_GUARD_ALLOW_PATHS or any(path.startswith(prefix) for prefix in _STARTUP_GUARD_ALLOW_PREFIXES):
        return await call_next(request)

    return JSONResponse(
        status_code=503,
        content=_error_payload(
            "Platform startup failed. Check /health startup diagnostics before retrying.",
            request,
        ),
    )


# -----------------------------------------
# Global Error Handling (Keep JSON Responses)
# -----------------------------------------
@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    log_event(
        "error",
        "db.sqlalchemy_error",
        request_id=getattr(getattr(request, "state", None), "request_id", None),
        error_type=type(exc).__name__,
        error=str(exc)[:240],
    )
    return JSONResponse(status_code=503, content=_error_payload("Database connection unavailable", request))


@app.exception_handler(ResponseValidationError)
async def response_validation_error_handler(request: Request, exc: ResponseValidationError):
    log_event(
        "error",
        "api.response_validation_error",
        request_id=getattr(getattr(request, "state", None), "request_id", None),
        error=str(exc)[:240],
    )
    return JSONResponse(status_code=500, content=_error_payload("Internal server error", request))


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return await http_exception_handler(request, exc)

    log_event(
        "error",
        "api.unhandled_exception",
        request_id=getattr(getattr(request, "state", None), "request_id", None),
        error_type=type(exc).__name__,
        error=str(exc)[:240],
    )
    return JSONResponse(status_code=500, content=_error_payload("Internal server error", request))


# -----------------------------------------
# Serve Frontend
# -----------------------------------------
app.mount("/frontend", FrontendStaticFiles(directory="frontend"), name="frontend")


@app.get("/")
def root():
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url="/frontend/index.html")


@app.get("/favicon.ico")
def favicon():
    return Response(status_code=204)


@app.get("/health")
def health(request: Request, db: Session = Depends(get_db)):
    auto_migrate = str(os.getenv("AUTO_MIGRATE", "")).strip()
    demo_seed_admin = str(os.getenv("DEMO_SEED_ADMIN", "")).strip().lower() in {"1", "true", "yes"}
    demo_admin_present = None

    if demo_seed_admin:
        try:
            from sqlalchemy import func

            demo_email = (os.getenv("DEMO_ADMIN_EMAIL") or "admin@umhlali.com").strip().lower()
            demo_admin_present = bool(
                db.query(models.User.id).filter(func.lower(models.User.email) == demo_email).first()
            )
        except Exception:
            demo_admin_present = None

    base_payload = {
        "db_source": DB_SOURCE,
        "db_driver": (DB_INFO or {}).get("driver"),
        "has_database_url": bool(os.getenv("DATABASE_URL")),
        "database_url_strict": str(os.getenv("DATABASE_URL_STRICT", "")).strip().lower() in {"1", "true", "yes"},
        "prefer_local_db": str(os.getenv("PREFER_LOCAL_DB", "")).strip().lower() in {"1", "true", "yes"},
        "force_sqlite": str(os.getenv("FORCE_SQLITE", "")).strip().lower() in {"1", "true", "yes"},
        "auto_migrate": auto_migrate or None,
        "demo_seed_admin": demo_seed_admin,
        "demo_admin_present": demo_admin_present,
        "render_git_commit": (os.getenv("RENDER_GIT_COMMIT") or "")[:12] or None,
        "uptime_s": int(max(0, time.monotonic() - APP_STARTED_MONOTONIC)),
        "route_metrics_routes": int(ROUTE_METRICS.snapshot(limit=1).get("route_count", 0)),
        "startup": getattr(request.app.state, "startup_diagnostics", {}) or {},
    }

    try:
        db.execute(text("select 1"))
        return {"ok": True, "db": "ok", **base_payload}
    except SQLAlchemyError as e:
        log_event("warning", "health.db_error", error_type=type(e).__name__, error=str(e)[:200])
        return {"ok": False, "db": "error", **base_payload}


@app.get("/metrics")
def metrics(request: Request):
    token = str(os.getenv("METRICS_TOKEN", "")).strip()
    if token:
        provided = str(request.headers.get("x-metrics-token") or "").strip()
        if provided != token:
            raise HTTPException(status_code=403, detail="Forbidden")

    return {
        "uptime_s": int(max(0, time.monotonic() - APP_STARTED_MONOTONIC)),
        "routes": ROUTE_METRICS.snapshot(limit=250),
        "rate_limiters": {
            "login": LOGIN_RATE_LIMITER.snapshot(),
            "signup": SIGNUP_RATE_LIMITER.snapshot(),
            "imports": IMPORT_RATE_LIMITER.snapshot(),
        },
    }


def _seed_demo_admin_if_enabled() -> None:
    enabled = str(os.getenv("DEMO_SEED_ADMIN", "")).strip().lower() in {"1", "true", "yes"}
    if not enabled:
        return

    email = (os.getenv("DEMO_ADMIN_EMAIL") or "admin@umhlali.com").strip().lower()
    password = os.getenv("DEMO_ADMIN_PASSWORD") or "123"
    name = (os.getenv("DEMO_ADMIN_NAME") or "Admin").strip() or "Admin"
    force_reset = (
        str(os.getenv("DEMO_ADMIN_FORCE_RESET", "")).strip().lower() in {"1", "true", "yes"}
        or DB_SOURCE == "SQLITE"
    )

    if not email or "@" not in email or not str(password):
        print("[DEMO_ADMIN] Skipped: invalid DEMO_ADMIN_EMAIL/DEMO_ADMIN_PASSWORD.")
        return

    from sqlalchemy import func

    from app.auth import get_password_hash
    from app.club_assignments import sync_user_club_assignment
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        preferred_club = (
            db.query(models.Club)
            .filter(func.lower(models.Club.slug) == "umhlali", models.Club.active == 1)
            .first()
        )
        if not preferred_club:
            active_clubs = db.query(models.Club).filter(models.Club.active == 1).order_by(models.Club.id.asc()).all()
            preferred_club = active_clubs[0] if len(active_clubs) == 1 else None
        preferred_club_id = int(getattr(preferred_club, "id", 0) or 0) or None

        user = db.query(models.User).filter(func.lower(models.User.email) == email).first()
        if not user:
            user = models.User(
                name=name,
                email=email,
                password=get_password_hash(password),
                role=models.UserRole.admin,
                club_id=preferred_club_id,
            )
            db.add(user)
            db.flush()
            if preferred_club_id:
                sync_user_club_assignment(
                    db,
                    user,
                    club_id=preferred_club_id,
                    role=models.UserRole.admin,
                    is_primary=True,
                )
            db.commit()
            print(f"[DEMO_ADMIN] Created demo admin user: {email} (db_source={DB_SOURCE}).")
            return

        if force_reset:
            user.password = get_password_hash(password)
            user.role = models.UserRole.admin
            user.club_id = preferred_club_id
            if preferred_club_id:
                sync_user_club_assignment(
                    db,
                    user,
                    club_id=preferred_club_id,
                    role=models.UserRole.admin,
                    is_primary=True,
                )
            db.commit()
            print(f"[DEMO_ADMIN] Reset demo admin password: {email} (db_source={DB_SOURCE}).")
    except Exception as e:
        print(f"[DEMO_ADMIN] Seed failed: {type(e).__name__}: {str(e)[:160]}")
    finally:
        db.close()


# -----------------------------------------
# Database initialization
# -----------------------------------------
try:
    Base.metadata.create_all(bind=engine)
    schema_diag = run_auto_migrations(engine)
    print("[DB] Database connected successfully")
    platform_diag = ensure_platform_ready()
    app.state.startup_diagnostics = {
        "status": str(platform_diag.get("status") or "ready"),
        "schema": schema_diag,
        "platform": platform_diag,
        "errors": list(platform_diag.get("errors") or []),
    }
    _seed_demo_admin_if_enabled()
    seed_demo_if_enabled()
except Exception as e:
    app.state.startup_diagnostics = {
        "status": "failed",
        "schema": {},
        "platform": {},
        "errors": [f"{type(e).__name__}: {str(e)[:240]}"],
    }
    log_event("error", "db.connection_warning", error=str(e)[:240], error_type=type(e).__name__)
    print(f"[BOOT] Startup failed: {type(e).__name__}: {str(e)[:240]}")


# -----------------------------------------
# Routers
# -----------------------------------------
app.include_router(users.router)
app.include_router(tee.router)
app.include_router(checkin.router)
app.include_router(scoring.router)
app.include_router(admin.router)
app.include_router(imports.router)
app.include_router(cashbook.router)
app.include_router(profile.router)
app.include_router(settings.router)
app.include_router(public.router)
app.include_router(super_admin.router)

# Import and include fees router
try:
    from app.routers import fees

    app.include_router(fees.router)
except Exception as e:
    log_event("warning", "router.fees_not_loaded", error=str(e)[:240])


# -----------------------------------------
# LOGIN endpoint
# -----------------------------------------
api = APIRouter()


@api.post("/login", response_model=schemas.Token)
def login(data: schemas.UserLogin, request: Request, db: Session = Depends(get_db)):
    """
    Login user and return JWT token.
    """
    client_ip = client_ip_from_request(request)
    normalized_email = normalize_identity(str(getattr(data, "email", "") or ""), default="unknown")
    limiter_key = f"{client_ip}:{normalized_email}"
    allowed, retry_after, _remaining = LOGIN_RATE_LIMITER.check(limiter_key)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Please try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )

    try:
        user = crud.authenticate_user(db, email=data.email, password=data.password)
        if not user:
            raise HTTPException(status_code=400, detail="Invalid username or password")
        LOGIN_RATE_LIMITER.reset(limiter_key)
        log_event("info", "auth.login_success", email=normalized_email, client_ip=client_ip)
        return user
    except HTTPException:
        log_event("warning", "auth.login_denied", email=normalized_email, client_ip=client_ip)
        raise
    except SQLAlchemyError as e:
        log_event("error", "auth.login_db_error", email=normalized_email, error=str(e)[:200])
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        log_event("error", "auth.login_failed", email=normalized_email, error=str(e)[:200])
        raise HTTPException(status_code=500, detail="Login failed")


app.include_router(api)
