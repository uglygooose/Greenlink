# app/schemas.py

from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# ------------------------------------------------------------------
# AUTH
# ------------------------------------------------------------------

class Token(BaseModel):
    access_token: str
    token_type: str
    role: Optional[str] = None


# ------------------------------------------------------------------
# USERS
# ------------------------------------------------------------------

class UserBase(BaseModel):
    name: str
    email: EmailStr


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int
    role: str
    handicap_number: Optional[str]
    greenlink_id: Optional[str]

    model_config = {"from_attributes": True}


# ------------------------------------------------------------------
# TEE TIMES
# ------------------------------------------------------------------

class TeeTimeCreate(BaseModel):
    tee_time: datetime
    hole: Optional[str] = None


class TeeTimeOut(BaseModel):
    id: int
    tee_time: datetime
    hole: Optional[str]

    model_config = {"from_attributes": True}


class TeeTimeWithBookings(BaseModel):
    id: int
    tee_time: datetime
    hole: Optional[str]
    bookings: List["BookingOut"] = []

    model_config = {"from_attributes": True}


# ------------------------------------------------------------------
# BOOKINGS
# ------------------------------------------------------------------

class BookingCreate(BaseModel):
    tee_time_id: int
    player_name: str
    player_email: Optional[EmailStr] = None
    club_card: Optional[str] = None
    handicap_number: Optional[str] = None
    greenlink_id: Optional[str] = None
    fee_category_id: Optional[int] = None
    price: Optional[float] = None


class BookingOut(BaseModel):
    id: int
    tee_time_id: int
    player_name: str
    player_email: Optional[str]
    club_card: Optional[str]
    handicap_number: Optional[str]
    greenlink_id: Optional[str]
    fee_category_id: Optional[int]
    price: float
    status: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ------------------------------------------------------------------
# ROUNDS
# ------------------------------------------------------------------

class RoundCreate(BaseModel):
    booking_id: int
    scores_json: Optional[str]


class RoundOut(BaseModel):
    id: int
    booking_id: int
    scores_json: Optional[str]
    handicap_sa_round_id: Optional[str]
    handicap_synced: bool
    closed: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ------------------------------------------------------------------
# FIX FOR FORWARD REFERENCES
# ------------------------------------------------------------------

TeeTimeWithBookings.model_rebuild()
