# app/auth.py

import os
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app import models
from app.database import SessionLocal

# ------------------------------------------------------------------
# ENV & CONFIG
# ------------------------------------------------------------------

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 1440)
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# tokenUrl must match your login endpoint
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# ------------------------------------------------------------------
# PASSWORD UTILS
# ------------------------------------------------------------------

def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Bcrypt has 72-byte limit
    if len(plain_password) > 72:
        plain_password = plain_password[:72]
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    bcrypt has a 72-byte limit — ensure client handles very long passwords.
    """
    # Truncate to 72 bytes if needed
    if len(password) > 72:
        password = password[:72]
    return pwd_context.hash(password)

# ------------------------------------------------------------------
# JWT UTILS
# ------------------------------------------------------------------

def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    data should include at least:
    {
        "sub": user.email,
        "role": user.role (optional but recommended)
    }
    """
    to_encode = data.copy()

    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# ------------------------------------------------------------------
# DATABASE DEPENDENCY
# ------------------------------------------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ------------------------------------------------------------------
# AUTH DEPENDENCIES
# ------------------------------------------------------------------

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.User:
    """
    Decode JWT and return current user.
    Used across both player and admin routes.
    """

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: Optional[str] = payload.get("sub")

        if email is None:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    user = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )

    if not user:
        raise credentials_exception

    return user

# ------------------------------------------------------------------
# OPTIONAL ROLE HELPERS (CLEAN & REUSABLE)
# ------------------------------------------------------------------

def require_admin(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    """
    Optional reusable admin guard.
    Your admin router already has verify_admin,
    but this can be reused elsewhere.
    """
    if current_user.role != models.UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
