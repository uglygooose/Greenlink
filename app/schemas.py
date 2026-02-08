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
    # Pricing / segmentation
    account_type: Optional[str] = None  # member | visitor
    # Optional profile fields (used for reporting + pricing snapshots on bookings)
    handicap_sa_id: Optional[str] = None
    handicap_number: Optional[str] = None
    handicap_index: Optional[float] = None
    home_club: Optional[str] = None
    gender: Optional[str] = None
    player_category: Optional[str] = None  # adult | student | pensioner | junior
    student: Optional[bool] = None
    birth_date: Optional[date] = None

    # Optional: create/update a Member profile row for pro-shop member search.
    create_member_profile: Optional[bool] = False
    member_number: Optional[str] = None
    phone: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int
    role: str
    phone: Optional[str] = None
    account_type: Optional[str] = None
    handicap_number: Optional[str]
    greenlink_id: Optional[str]
    handicap_sa_id: Optional[str] = None
    home_course: Optional[str] = None
    gender: Optional[str] = None
    player_category: Optional[str] = None
    student: Optional[bool] = None
    handicap_index: Optional[float] = None

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
    handicap_sa_id: Optional[str] = None
    home_club: Optional[str] = None
    handicap_index: Optional[float] = None
    source: Optional[str] = "proshop"
    external_provider: Optional[str] = None
    external_booking_id: Optional[str] = None
    fee_category_id: Optional[int] = None
    price: Optional[float] = None
    prepaid: Optional[bool] = False
    cart: Optional[bool] = False
    push_cart: Optional[bool] = False
    caddy: Optional[bool] = False
    holes: Optional[int] = None  # 9 or 18 (default 18)
    gender: Optional[str] = None
    player_category: Optional[str] = None

    # Optional inputs for automatic fee selection when `fee_category_id` is not provided.
    # Some fields may be snapshotted onto the Booking for reporting.
    player_type: Optional[str] = None   # member | visitor | non_affiliated | reciprocity
    birth_date: Optional[date] = None
    age: Optional[int] = None
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
    handicap_sa_id: Optional[str] = None
    home_club: Optional[str] = None
    source: Optional[str] = None
    external_provider: Optional[str] = None
    external_booking_id: Optional[str] = None
    fee_category_id: Optional[int]
    price: float
    status: str
    holes: Optional[int] = None
    prepaid: Optional[bool] = None
    cart: Optional[bool] = None
    push_cart: Optional[bool] = None
    caddy: Optional[bool] = None
    gender: Optional[str] = None
    player_category: Optional[str] = None
    handicap_index_at_booking: Optional[float] = None
    handicap_index_at_play: Optional[float] = None
    player_type: Optional[str] = None
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
