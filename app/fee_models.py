# app/fee_models.py
from sqlalchemy import Column, Integer, String, Float, Enum
from app.database import Base
import enum

class FeeType(str, enum.Enum):
    GOLF = "golf"
    CART = "cart"
    COMPETITION = "competition"
    DRIVING_RANGE = "driving_range"
    OTHER = "other"

class FeeCategory(Base):
    """Fee categories from 2026 price list"""
    __tablename__ = "fee_categories"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(Integer, unique=True, index=True)
    description = Column(String(500), nullable=False)
    price = Column(Float, nullable=False)
    fee_type = Column(Enum(FeeType), default=FeeType.GOLF)
    active = Column(Integer, default=1)
