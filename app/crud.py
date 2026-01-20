# app/crud.py
from sqlalchemy.orm import Session
from app import models, schemas
from app.auth import get_password_hash, verify_password, create_access_token
from app.integrations import handicap_sa
from fastapi import HTTPException

def create_user(db: Session, user: schemas.UserCreate):
    existing = db.query(models.User).filter(models.User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = get_password_hash(user.password)
    db_user = models.User(name=user.name, email=user.email, password=hashed)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(db: Session, email: str, password: str):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({
        "sub": user.email,
        "role": user.role
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role or "player"
    }

# tee-time / booking crud
def create_tee_time(db: Session, tee_time_iso):
    tt = models.TeeTime(tee_time=tee_time_iso)
    db.add(tt)
    db.commit()
    db.refresh(tt)
    return tt

def list_tee_times(db: Session):
    return db.query(models.TeeTime).order_by(models.TeeTime.tee_time).all()

def create_booking(db: Session, booking_in: schemas.BookingCreate):
    # Get fee category if provided
    fee_category_id = getattr(booking_in, 'fee_category_id', None)
    price = getattr(booking_in, 'price', 350.0)
    
    # If fee_category_id is provided, get price from fee table
    if fee_category_id:
        from app.fee_models import FeeCategory
        fee_cat = db.query(FeeCategory).filter(FeeCategory.id == fee_category_id).first()
        if fee_cat:
            price = fee_cat.price
    
    b = models.Booking(
        tee_time_id=booking_in.tee_time_id,
        player_name=booking_in.player_name,
        player_email=booking_in.player_email,
        club_card=booking_in.club_card,
        handicap_number=getattr(booking_in, 'handicap_number', None),
        greenlink_id=getattr(booking_in, 'greenlink_id', None),
        fee_category_id=fee_category_id,
        price=price
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    
    # Get fee description for ledger
    fee_description = f"Green fee - {b.player_name}"
    if fee_category_id:
        from app.fee_models import FeeCategory
        fee_cat = db.query(FeeCategory).filter(FeeCategory.id == fee_category_id).first()
        if fee_cat:
            fee_description = fee_cat.description
    
    # Create ledger entry with actual price
    le = models.LedgerEntry(
        booking_id=b.id, 
        description=fee_description, 
        amount=b.price
    )
    db.add(le)
    db.commit()
    
    # DEPRECATED: Sage One / Pastel accounting sync removed
    # New system uses cashbook Excel exports instead
    # See: app/routers/cashbook.py and CASHBOOK_EXPORT.md
    
    return b

def list_bookings_for_tee(db: Session, tee_time_id: int):
    return db.query(models.Booking).filter(models.Booking.tee_time_id == tee_time_id).all()

def checkin_booking(db: Session, booking_id: int):
    b = db.query(models.Booking).get(booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    b.status = models.BookingStatus.checked_in
    db.commit()
    
    # Open round in Handicap SA
    handicap_result = handicap_sa.open_round(
        player_name=b.player_name,
        handicap_number=b.handicap_number or "N/A",
        greenlink_id=b.greenlink_id
    )
    
    # Create round with Handicap SA round ID
    r = models.Round(
        booking_id=b.id,
        handicap_sa_round_id=handicap_result["round_id"]
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    
    return {"booking": b, "round": r, "handicap_sa": handicap_result}

def submit_scores(db: Session, booking_id: int, scores_json: str):
    b = db.query(models.Booking).get(booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if not b.round:
        # Create round if it doesn't exist (edge case)
        r = models.Round(booking_id=b.id, scores_json=scores_json, closed=1)
        db.add(r)
        db.commit()
        db.refresh(r)
    else:
        r = b.round
        r.scores_json = scores_json
        r.closed = 1
        
        # Submit to Handicap SA
        if r.handicap_sa_round_id:
            handicap_result = handicap_sa.submit_scores(
                round_id=r.handicap_sa_round_id,
                scores_json=scores_json,
                player_name=b.player_name
            )
            
            if handicap_result["success"]:
                r.handicap_synced = 1
        
        db.commit()
    
    b.status = models.BookingStatus.completed
    db.commit()
    
    return r
