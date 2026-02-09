# app/main.py
from fastapi import FastAPI, Depends, HTTPException, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi import Response
from fastapi.responses import JSONResponse
from fastapi.exceptions import ResponseValidationError
from fastapi.exception_handlers import http_exception_handler
from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from starlette.requests import Request
import os

from app.database import Base, engine, DB_SOURCE, DB_INFO
from app.routers import users, tee, checkin, scoring, admin, cashbook, profile, settings
from app import auth, models, crud, schemas, fee_models
from app.auth import get_db
from app.migrations import run_auto_migrations

# -----------------------------------------
# Create app instance
# -----------------------------------------
app = FastAPI(title="GreenLink MVP")

# -----------------------------------------
# Global Error Handling (Keep JSON Responses)
# -----------------------------------------
@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    # Ensure frontend never gets plain-text "Internal Server Error" on DB issues.
    print(f"[DB] SQLAlchemy error: {str(exc)[:240]}")
    return JSONResponse(status_code=503, content={"detail": "Database connection unavailable"})

@app.exception_handler(ResponseValidationError)
async def response_validation_error_handler(request: Request, exc: ResponseValidationError):
    # Response-model mismatches otherwise become plain-text 500s (hard to debug from JS).
    print(f"[API] Response validation error: {str(exc)[:240]}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Keep error responses JSON so the frontend never crashes on `response.json()`.
    # Preserve FastAPI's HTTPException behavior.
    if isinstance(exc, HTTPException):
        return await http_exception_handler(request, exc)

    print(f"[UNHANDLED] {type(exc).__name__}: {str(exc)[:240]}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# -----------------------------------------
# CORS Settings
# -----------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     # Change to frontend origin later
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# -----------------------------------------
# Serve Frontend
# -----------------------------------------
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")

# Root redirect to frontend
@app.get("/")
def root():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/frontend/index.html")

@app.get("/favicon.ico")
def favicon():
    # Avoid noisy 404s in the browser console.
    return Response(status_code=204)

@app.get("/health")
def health(db: Session = Depends(get_db)):
    """
    Lightweight health check for Render/Supabase debugging.
    """
    demo_seed_admin = str(os.getenv("DEMO_SEED_ADMIN", "")).strip().lower() in {"1", "true", "yes"}
    demo_admin_present = None
    if demo_seed_admin:
        try:
            from sqlalchemy import func

            demo_email = (os.getenv("DEMO_ADMIN_EMAIL") or "admin@greenlink.com").strip().lower()
            demo_admin_present = bool(
                db.query(models.User.id).filter(func.lower(models.User.email) == demo_email).first()
            )
        except Exception:
            demo_admin_present = None

    try:
        db.execute(text("select 1"))
        return {
            "ok": True,
            "db": "ok",
            "db_source": DB_SOURCE,
            "db_driver": (DB_INFO or {}).get("driver"),
            "has_database_url": bool(os.getenv("DATABASE_URL")),
            "database_url_strict": str(os.getenv("DATABASE_URL_STRICT", "")).strip().lower() in {"1", "true", "yes"},
            "demo_seed_admin": demo_seed_admin,
            "demo_admin_present": demo_admin_present,
            "render_git_commit": (os.getenv("RENDER_GIT_COMMIT") or "")[:12] or None,
        }
    except SQLAlchemyError as e:
        print(f"[HEALTH] Database error: {str(e)[:200]}")
        return {
            "ok": False,
            "db": "error",
            "db_source": DB_SOURCE,
            "db_driver": (DB_INFO or {}).get("driver"),
            "has_database_url": bool(os.getenv("DATABASE_URL")),
            "database_url_strict": str(os.getenv("DATABASE_URL_STRICT", "")).strip().lower() in {"1", "true", "yes"},
            "demo_seed_admin": demo_seed_admin,
            "demo_admin_present": demo_admin_present,
            "render_git_commit": (os.getenv("RENDER_GIT_COMMIT") or "")[:12] or None,
        }


def _seed_demo_admin_if_enabled() -> None:
    """
    Optional safety net for demo hosts (e.g., Render) that are accidentally running on
    an ephemeral SQLite fallback DB.

    This is opt-in via env vars so we don't silently create weak credentials on real deployments.
    """

    enabled = str(os.getenv("DEMO_SEED_ADMIN", "")).strip().lower() in {"1", "true", "yes"}
    if not enabled:
        return

    email = (os.getenv("DEMO_ADMIN_EMAIL") or "admin@greenlink.com").strip().lower()
    password = os.getenv("DEMO_ADMIN_PASSWORD") or "123"
    name = (os.getenv("DEMO_ADMIN_NAME") or "Admin").strip() or "Admin"
    # For SQLite demo hosts (e.g., Render fallback), default to resetting each start so
    # the "standard demo" credentials stay predictable.
    force_reset = (
        str(os.getenv("DEMO_ADMIN_FORCE_RESET", "")).strip().lower() in {"1", "true", "yes"}
        or DB_SOURCE == "SQLITE"
    )

    if not email or "@" not in email or not str(password):
        print("[DEMO_ADMIN] Skipped: invalid DEMO_ADMIN_EMAIL/DEMO_ADMIN_PASSWORD.")
        return

    from sqlalchemy import func
    from app.auth import get_password_hash
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        user = db.query(models.User).filter(func.lower(models.User.email) == email).first()
        if not user:
            user = models.User(
                name=name,
                email=email,
                password=get_password_hash(password),
                role=models.UserRole.admin,
            )
            db.add(user)
            db.commit()
            print(f"[DEMO_ADMIN] Created demo admin user: {email} (db_source={DB_SOURCE}).")
            return

        if force_reset:
            user.password = get_password_hash(password)
            user.role = models.UserRole.admin
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
    run_auto_migrations(engine)
    print("[DB] Database connected successfully")
    _seed_demo_admin_if_enabled()
except Exception as e:
    print(f"[DB] Warning: Could not connect to database: {str(e)[:100]}")
    print("[DB] System will run in offline mode (no data persistence)")

# -----------------------------------------
# Routers
# -----------------------------------------
app.include_router(users.router)
app.include_router(tee.router)
app.include_router(checkin.router)
app.include_router(scoring.router)
app.include_router(admin.router)
app.include_router(cashbook.router)
app.include_router(profile.router)
app.include_router(settings.router)

# Import and include fees router
try:
    from app.routers import fees
    app.include_router(fees.router)
except Exception as e:
    print(f"[WARNING] Fees router not loaded: {e}")

# -----------------------------------------
# LOGIN endpoint
# -----------------------------------------
api = APIRouter()

@api.post("/login", response_model=schemas.Token)
def login(data: schemas.UserLogin, db: Session = Depends(get_db)):
    """
    Login user and return JWT token
    """
    try:
        user = crud.authenticate_user(db, email=data.email, password=data.password)
        if not user:
            raise HTTPException(status_code=400, detail="Invalid username or password")
        return user
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        # If the DB is unreachable/misconfigured on a demo host, surface a JSON error
        # instead of a generic "Internal Server Error" HTML response.
        print(f"[LOGIN] Database error: {str(e)[:200]}")
        raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        print(f"[LOGIN] Unexpected error: {str(e)[:200]}")
        raise HTTPException(status_code=500, detail="Login failed")

app.include_router(api)
