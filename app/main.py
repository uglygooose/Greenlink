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
    try:
        db.execute(text("select 1"))
        return {"ok": True, "db": "ok", "db_source": DB_SOURCE, "db_driver": (DB_INFO or {}).get("driver")}
    except SQLAlchemyError as e:
        print(f"[HEALTH] Database error: {str(e)[:200]}")
        return {"ok": False, "db": "error", "db_source": DB_SOURCE, "db_driver": (DB_INFO or {}).get("driver")}

# -----------------------------------------
# Database initialization
# -----------------------------------------
try:
    Base.metadata.create_all(bind=engine)
    run_auto_migrations(engine)
    print("[DB] Database connected successfully")
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
