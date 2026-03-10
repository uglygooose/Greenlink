from sqlalchemy import Column, Date, Enum, Float, ForeignKey, Integer, String, Time, UniqueConstraint
from app.database import Base
import enum

class FeeType(str, enum.Enum):
    GOLF = "golf"
    CART = "cart"
    PUSH_CART = "push_cart"
    CADDY = "caddy"
    COMPETITION = "competition"
    DRIVING_RANGE = "driving_range"
    OTHER = "other"

class FeeCategory(Base):
    """
    Fee categories from 2026 price list.

    Note: `code/description/price/fee_type` are the source-of-truth values.
    Optional "filter" columns support automatic fee selection based on booking details.
    """
    __tablename__ = "fee_categories"
    __table_args__ = (UniqueConstraint("club_id", "code", name="uq_fee_categories_club_code"),)
    
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    code = Column(Integer, index=True)
    description = Column(String(500), nullable=False)
    price = Column(Float, nullable=False)
    # Use a stable enum type name so Postgres migrations (e.g., Supabase) can define it predictably.
    fee_type = Column(Enum(FeeType, name="fee_type"), default=FeeType.GOLF)
    active = Column(Integer, default=1)

    # Optional pricing filters (used for auto-pricing when fee_category_id is not provided)
    # Convention: store lowercase strings (e.g., "member", "visitor", "weekday").
    audience = Column(String(30), nullable=True, index=True)   # member | visitor | non_affiliated | reciprocity | other
    gender = Column(String(10), nullable=True, index=True)     # male | female
    day_kind = Column(String(10), nullable=True, index=True)   # weekday | weekend
    weekday = Column(Integer, nullable=True, index=True)       # 0=Mon ... 6=Sun
    holes = Column(Integer, nullable=True, index=True)         # 9 or 18
    min_age = Column(Integer, nullable=True, index=True)
    max_age = Column(Integer, nullable=True, index=True)
    start_date = Column(Date, nullable=True, index=True)
    end_date = Column(Date, nullable=True, index=True)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    priority = Column(Integer, default=0, index=True)
