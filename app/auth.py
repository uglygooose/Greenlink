# app/auth.py

import os
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy import event
from sqlalchemy.orm import Session
from sqlalchemy.orm import with_loader_criteria

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

_TENANT_SCOPED_MODELS = (
    models.User,
    models.Member,
    models.TeeTime,
    models.Booking,
    models.LedgerEntry,
    models.DayClose,
    models.AccountingSetting,
    models.KpiTarget,
    models.ClubSetting,
    models.ImportBatch,
    models.RevenueTransaction,
    models.ProShopProduct,
    models.ProShopSale,
    models.ProShopSaleItem,
    models.PlayerNotification,
)


@event.listens_for(Session, "do_orm_execute")
def _apply_tenant_scope(execute_state):  # type: ignore[no-untyped-def]
    """
    Enforce per-club data isolation whenever `session.info["club_id"]` is set.

    `get_active_club_id()` sets the club_id on the request session for admin/staff
    endpoints. This hook ensures any ORM SELECT query touching club-scoped models
    is automatically filtered, even if a developer forgets to add `club_id` to a query.

    Notes:
    - Only applies to SELECTs (writes must still set `club_id` on new rows).
    - Does not affect tables without `club_id`.
    """
    if not execute_state.is_select:
        return

    session = execute_state.session
    club_id = getattr(session, "info", {}).get("club_id")
    if not club_id:
        return

    try:
        club_id_int = int(club_id)
    except Exception:
        return
    if club_id_int <= 0:
        return

    stmt = execute_state.statement
    for model in _TENANT_SCOPED_MODELS:
        stmt = stmt.options(
            with_loader_criteria(
                model,
                lambda cls, cid=club_id_int: cls.club_id == cid,  # type: ignore[attr-defined]
                include_aliases=True,
            )
        )
    execute_state.statement = stmt


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
