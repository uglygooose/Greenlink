# app/main.py
from fastapi import FastAPI, Depends, HTTPException, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.database import Base, engine
from app.routers import users, tee, checkin, scoring, admin, cashbook, profile
from app import auth, models, crud, schemas, fee_models
from app.auth import get_db

# -----------------------------------------
# Create app instance
# -----------------------------------------
app = FastAPI(title="GreenLink MVP")

# -----------------------------------------
# CORS Settings
# -----------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     # Change to frontend origin later
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
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

# -----------------------------------------
# Database initialization
# -----------------------------------------
try:
    Base.metadata.create_all(bind=engine)
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
    user = crud.authenticate_user(db, email=data.email, password=data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid username or password")
    return user

app.include_router(api)
