# app/models.py
from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Enum, Float, Text, Boolean, BigInteger
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.database import Base

class UserRole(str, enum.Enum):
    admin = "admin"
    club_staff = "club_staff"
    player = "player"

class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    unknown = "unknown"

class PlayerCategory(str, enum.Enum):
    adult = "adult"
    student = "student"
    pensioner = "pensioner"
    junior = "junior"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.player)
    phone = Column(String(50), nullable=True)
    account_type = Column(String(20), nullable=True)  # member | visitor (used for pricing defaults)
    handicap_number = Column(String(50), nullable=True)
    greenlink_id = Column(String(50), unique=True, nullable=True)
    birth_date = Column(DateTime, nullable=True)
    handicap_sa_id = Column(String(50), nullable=True)
    home_course = Column(String(100), nullable=True)
    gender = Column(String(20), nullable=True)  # Gender enum values stored as text for portability.
    player_category = Column(String(20), nullable=True)  # PlayerCategory stored as text.
    student = Column(Boolean, nullable=True)
    handicap_index = Column(Float, nullable=True)


class Member(Base):
    __tablename__ = "members"
    id = Column(Integer, primary_key=True, index=True)
    member_number = Column(String(50), unique=True, nullable=True)
    first_name = Column(String(120), nullable=False)
    last_name = Column(String(120), nullable=False)
    email = Column(String(200), unique=True, nullable=True)
    phone = Column(String(50), nullable=True)
    handicap_number = Column(String(50), nullable=True)
    home_club = Column(String(120), nullable=True)
    active = Column(Integer, default=1)
    gender = Column(String(20), nullable=True)
    player_category = Column(String(20), nullable=True)
    student = Column(Boolean, nullable=True)
    handicap_index = Column(Float, nullable=True)
    handicap_sa_id = Column(String(50), nullable=True)

    bookings = relationship("Booking", back_populates="member")

class TeeTime(Base):
    __tablename__ = "tee_times"
    id = Column(Integer, primary_key=True, index=True)
    tee_time = Column(DateTime, nullable=False, index=True)
    hole = Column(String(10), nullable=True)
    capacity = Column(Integer, default=4)
    status = Column(String(20), default="open")  # open/blocked
    available_from = Column(DateTime, nullable=True)
    bookable_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    bookings = relationship("Booking", back_populates="tee_time", cascade="all, delete-orphan")

class BookingStatus(str, enum.Enum):
    booked = "booked"
    checked_in = "checked_in"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"


class BookingSource(str, enum.Enum):
    proshop = "proshop"
    member = "member"
    external = "external"

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    tee_time_id = Column(Integer, ForeignKey("tee_times.id"))
    member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    player_name = Column(String(200), nullable=False)
    player_email = Column(String(200), nullable=True)
    club_card = Column(String(100), nullable=True)
    handicap_number = Column(String(50), nullable=True)
    greenlink_id = Column(String(50), nullable=True)
    source = Column(Enum(BookingSource), default=BookingSource.proshop)
    external_provider = Column(String(50), nullable=True)
    external_booking_id = Column(String(100), nullable=True)
    party_size = Column(Integer, default=1)
    fee_category_id = Column(Integer, ForeignKey("fee_categories.id"), nullable=True)
    price = Column(Float, default=350.0)  # Default green fee
    status = Column(Enum(BookingStatus), default=BookingStatus.booked)
    # Booking-level attributes (snapshotted at booking time for reporting)
    player_type = Column(String(30), nullable=True)  # member | visitor | non_affiliated | reciprocity
    holes = Column(Integer, nullable=True)
    prepaid = Column(Boolean, nullable=True)
    gender = Column(String(20), nullable=True)
    player_category = Column(String(20), nullable=True)
    handicap_sa_id = Column(String(50), nullable=True)
    home_club = Column(String(120), nullable=True)
    handicap_index_at_booking = Column(Float, nullable=True)
    handicap_index_at_play = Column(Float, nullable=True)
    # Requirements captured at booking time
    cart = Column(Boolean, nullable=True)
    push_cart = Column(Boolean, nullable=True)
    caddy = Column(Boolean, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tee_time = relationship("TeeTime", back_populates="bookings")
    member = relationship("Member", back_populates="bookings")
    round = relationship("Round", uselist=False, back_populates="booking")

class Round(Base):
    __tablename__ = "rounds"
    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), unique=True)
    scores_json = Column(Text, nullable=True)  # store JSON string of holes/scores
    handicap_sa_round_id = Column(String(100), nullable=True)  # ID from Handicap SA
    handicap_synced = Column(Integer, default=0)
    closed = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    booking = relationship("Booking", back_populates="round")

class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=True)
    description = Column(String(255))
    amount = Column(Float, default=0.0)
    pastel_synced = Column(Integer, default=0)
    pastel_transaction_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    meta = relationship("LedgerEntryMeta", back_populates="ledger_entry", uselist=False, cascade="all, delete-orphan")


class LedgerEntryMeta(Base):
    __tablename__ = "ledger_entry_meta"
    ledger_entry_id = Column(Integer, ForeignKey("ledger_entries.id"), primary_key=True)
    payment_method = Column(String(30), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)

    ledger_entry = relationship("LedgerEntry", back_populates="meta")


class DayClose(Base):
    __tablename__ = "day_closures"
    id = Column(Integer, primary_key=True, index=True)
    close_date = Column(Date, unique=True, index=True, nullable=False)
    status = Column(String(20), default="closed")  # closed/reopened
    closed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    closed_at = Column(DateTime, default=datetime.utcnow)
    reopened_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reopened_at = Column(DateTime, nullable=True)
    export_method = Column(String(50), default="cashbook")
    export_batch_id = Column(String(50), nullable=True)
    export_filename = Column(String(255), nullable=True)
    auto_push = Column(Integer, default=0)


class AccountingSetting(Base):
    __tablename__ = "accounting_settings"
    id = Column(Integer, primary_key=True, index=True)
    green_fees_gl = Column(String(50), default="1000-000")
    cashbook_contra_gl = Column(String(50), default="8400/000")
    vat_rate = Column(Float, default=0.15)
    tax_type = Column(Integer, default=1)  # 0=no tax, 1=tax
    cashbook_name = Column(String(120), default="Main Bank")
    updated_at = Column(DateTime, default=datetime.utcnow)


class KpiTarget(Base):
    __tablename__ = "kpi_targets"
    id = Column(BigInteger, primary_key=True, index=True)
    year = Column(Integer, nullable=False, index=True)
    metric = Column(String(50), nullable=False, index=True)  # "revenue" | "rounds" (extendable)
    annual_target = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ClubSetting(Base):
    __tablename__ = "club_settings"
    key = Column(String(200), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
