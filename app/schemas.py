# app/schemas.py

from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, date

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
    capacity: Optional[int] = 4
    status: Optional[str] = "open"


class TeeTimeOut(BaseModel):
    id: int
    tee_time: datetime
    hole: Optional[str]
    capacity: int
    status: str

    model_config = {"from_attributes": True}


class TeeTimeWithBookings(BaseModel):
    id: int
    tee_time: datetime
    hole: Optional[str]
    capacity: int
    status: str
    bookings: List["BookingOut"] = []

    model_config = {"from_attributes": True}


# ------------------------------------------------------------------
# BOOKINGS
# ------------------------------------------------------------------

class BookingCreate(BaseModel):
    tee_time_id: int
    party_size: Optional[int] = 1
    member_id: Optional[int] = None
    player_name: str
    player_email: Optional[EmailStr] = None
    club_card: Optional[str] = None
    handicap_number: Optional[str] = None
    greenlink_id: Optional[str] = None
    source: Optional[str] = "proshop"
    external_provider: Optional[str] = None
    external_booking_id: Optional[str] = None
    fee_category_id: Optional[int] = None
    price: Optional[float] = None
    prepaid: Optional[bool] = False
    cart: Optional[bool] = False

    # Optional inputs for automatic fee selection when `fee_category_id` is not provided.
    # These are NOT persisted on the Booking model; they only influence the chosen fee.
    player_type: Optional[str] = None   # member | visitor | non_affiliated | reciprocity
    gender: Optional[str] = None        # male | female
    birth_date: Optional[date] = None
    age: Optional[int] = None
    holes: Optional[int] = None         # 9 or 18 (default 18)
    auto_price: Optional[bool] = True
    notes: Optional[str] = None


class BookingOut(BaseModel):
    id: int
    tee_time_id: int
    party_size: int
    member_id: Optional[int] = None
    created_by_user_id: Optional[int] = None
    player_name: str
    player_email: Optional[str]
    club_card: Optional[str]
    handicap_number: Optional[str]
    greenlink_id: Optional[str]
    source: Optional[str] = None
    external_provider: Optional[str] = None
    external_booking_id: Optional[str] = None
    fee_category_id: Optional[int]
    price: float
    status: str
    notes: Optional[str] = None
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
