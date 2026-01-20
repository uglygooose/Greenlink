# app/models.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Float, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.database import Base

class UserRole(str, enum.Enum):
    admin = "admin"
    club_staff = "club_staff"
    player = "player"

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.player)
    handicap_number = Column(String(50), nullable=True)
    greenlink_id = Column(String(50), unique=True, nullable=True)

class TeeTime(Base):
    __tablename__ = "tee_times"
    id = Column(Integer, primary_key=True, index=True)
    tee_time = Column(DateTime, nullable=False, index=True)
    hole = Column(String(10), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    bookings = relationship("Booking", back_populates="tee_time", cascade="all, delete-orphan")

class BookingStatus(str, enum.Enum):
    booked = "booked"
    checked_in = "checked_in"
    completed = "completed"
    cancelled = "cancelled"

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    tee_time_id = Column(Integer, ForeignKey("tee_times.id"))
    player_name = Column(String(200), nullable=False)
    player_email = Column(String(200), nullable=True)
    club_card = Column(String(100), nullable=True)
    handicap_number = Column(String(50), nullable=True)
    greenlink_id = Column(String(50), nullable=True)
    fee_category_id = Column(Integer, ForeignKey("fee_categories.id"), nullable=True)
    price = Column(Float, default=350.0)  # Default green fee
    status = Column(Enum(BookingStatus), default=BookingStatus.booked)
    created_at = Column(DateTime, default=datetime.utcnow)

    tee_time = relationship("TeeTime", back_populates="bookings")
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
