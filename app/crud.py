from __future__ import annotations
# app/crud.py
from sqlalchemy.orm import Session
from sqlalchemy import func
from app import models, schemas
from app.auth import get_password_hash, verify_password, create_access_token
from app.integrations import handicap_sa
from fastapi import HTTPException

def _append_note(notes: str | None, line: str) -> str:
    if not notes:
        return line
    if line in notes:
        return notes
    return f"{notes}\n{line}"

def _has_cart_note(notes: str | None) -> bool:
    return "Cart:" in str(notes or "")

def _cart_is_paired(notes: str | None) -> bool:
    text = str(notes or "")
    return "Cart split" in text or "Cart paired" in text or "Cart shared" in text

def _infer_player_type_for_booking(booking: models.Booking) -> str:
    return "member" if getattr(booking, "member_id", None) else "visitor"

def _select_cart_fee(db: Session, tee_time, player_type: str, holes: int = 18):
    from app.fee_models import FeeType
    from app.pricing import PricingContext, normalize_player_type, select_best_fee_category

    ctx = PricingContext(
        fee_type=FeeType.CART,
        tee_time=tee_time,
        player_type=normalize_player_type(player_type),
        holes=holes,
    )
    return select_best_fee_category(db, ctx)

def ensure_paid_ledger_entry(db: Session, booking: models.Booking) -> None:
    """
    Ensure a single ledger entry exists once a booking is considered paid.
    Payment is assumed when status is checked_in/completed.
    """
    if not booking or not booking.id:
        return

    description = f"Green fee - {booking.player_name}"
    if getattr(booking, "fee_category_id", None):
        try:
            from app.fee_models import FeeCategory
            fee_cat = db.query(FeeCategory).filter(FeeCategory.id == booking.fee_category_id).first()
            if fee_cat and fee_cat.description:
                description = fee_cat.description
        except Exception:
            pass
    notes = str(getattr(booking, "notes", "") or "")
    if "Cart:" in notes:
        description = f"{description} + Cart"
    amount = float(getattr(booking, "price", None) or 0.0)

    existing = db.query(models.LedgerEntry).filter(models.LedgerEntry.booking_id == booking.id).first()
    if existing:
        existing.description = description
        existing.amount = amount
        return

    db.add(models.LedgerEntry(booking_id=booking.id, description=description, amount=amount))

def is_day_closed(db: Session, target_date):
    if not target_date:
        return False
    return db.query(models.DayClose).filter(
        models.DayClose.close_date == target_date,
        models.DayClose.status == "closed"
    ).first() is not None

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
def create_tee_time(db: Session, tee_time_iso, hole=None, capacity=4, status="open"):
    if is_day_closed(db, tee_time_iso.date()):
        raise HTTPException(status_code=403, detail="Tee sheet is closed for this date")

    existing = db.query(models.TeeTime).filter(
        models.TeeTime.tee_time == tee_time_iso,
        models.TeeTime.hole == hole
    ).first()
    if existing:
        return existing

    tt = models.TeeTime(
        tee_time=tee_time_iso,
        hole=hole,
        capacity=capacity,
        status=status
    )
    db.add(tt)
    db.commit()
    db.refresh(tt)
    return tt

def list_tee_times(db: Session):
    return db.query(models.TeeTime).order_by(models.TeeTime.tee_time).all()

def create_booking(db: Session, booking_in: schemas.BookingCreate):
    # Validate tee time exists
    tee_time = db.query(models.TeeTime).filter(models.TeeTime.id == booking_in.tee_time_id).first()
    if not tee_time:
        raise HTTPException(status_code=404, detail="Tee time not found")

    if is_day_closed(db, tee_time.tee_time.date()):
        raise HTTPException(status_code=403, detail="Tee sheet is closed for this date")

    # Capacity enforcement
    party_size = booking_in.party_size or 1
    existing_bookings = db.query(models.Booking).filter(models.Booking.tee_time_id == booking_in.tee_time_id).all()
    existing_total = sum((b.party_size or 1) for b in existing_bookings)
    if existing_total + party_size > (tee_time.capacity or 4):
        raise HTTPException(status_code=409, detail="Tee time capacity exceeded")

    # Resolve member link (explicit id or match by email)
    resolved_member_id = getattr(booking_in, "member_id", None)
    if not resolved_member_id and getattr(booking_in, "player_email", None):
        email = str(booking_in.player_email).strip().lower()
        if email:
            member_match = (
                db.query(models.Member)
                .filter(func.lower(models.Member.email) == email, models.Member.active == 1)
                .first()
            )
            if member_match:
                resolved_member_id = member_match.id

    # Validate member if provided/resolved
    if resolved_member_id:
        member = db.query(models.Member).filter(models.Member.id == resolved_member_id).first()
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

    # Fee resolution
    fee_category_id = getattr(booking_in, "fee_category_id", None)
    price = booking_in.price if getattr(booking_in, "price", None) is not None else 350.0
    notes_val = getattr(booking_in, "notes", None)
    resolved_fee_cat = None

    # If fee_category_id is provided, get price from fee table
    if fee_category_id:
        from app.fee_models import FeeCategory
        resolved_fee_cat = db.query(FeeCategory).filter(FeeCategory.id == fee_category_id).first()
        if resolved_fee_cat:
            if getattr(booking_in, "price", None) is None:
                price = resolved_fee_cat.price

    # Auto-pricing (only when caller did NOT provide fee_category_id or explicit price)
    if not fee_category_id and getattr(booking_in, "price", None) is None and getattr(booking_in, "auto_price", True):
        try:
            from app.fee_models import FeeType, FeeCategory
            from app.pricing import PricingContext, compute_age, normalize_gender, normalize_player_type, select_best_fee_category

            player_type = normalize_player_type(getattr(booking_in, "player_type", None))
            gender = normalize_gender(getattr(booking_in, "gender", None))
            holes = int(getattr(booking_in, "holes", None) or 18)

            # Infer player type when possible
            if not player_type:
                if getattr(booking_in, "member_id", None):
                    player_type = "member"
                elif getattr(booking_in, "player_email", None):
                    member_match = (
                        db.query(models.Member)
                        .filter(models.Member.email == booking_in.player_email, models.Member.active == 1)
                        .first()
                    )
                    if member_match:
                        player_type = "member"
                    else:
                        player_type = "visitor"
                else:
                    # No way to infer reliably; leave unset so auto-pricing won't pick "gendered member" fees by accident.
                    player_type = None

            # Infer age from birth_date or known user profile
            age = getattr(booking_in, "age", None)
            if age is None:
                birth_date = getattr(booking_in, "birth_date", None)
                if birth_date:
                    age = compute_age(tee_time.tee_time.date(), birth_date)
                elif getattr(booking_in, "player_email", None):
                    user = db.query(models.User).filter(models.User.email == booking_in.player_email).first()
                    if user and user.birth_date:
                        age = compute_age(tee_time.tee_time.date(), user.birth_date.date())

            ctx = PricingContext(
                fee_type=FeeType.GOLF,
                tee_time=tee_time.tee_time,
                player_type=player_type,
                gender=gender,
                holes=holes,
                age=age,
            )

            resolved_fee_cat = select_best_fee_category(db, ctx)
            if resolved_fee_cat:
                fee_category_id = resolved_fee_cat.id
                price = resolved_fee_cat.price
            else:
                # Fail loudly only when we have enough context to believe auto-pricing was intended,
                # otherwise fall back to the default price (backward-compatible behavior).
                explicit_fields = getattr(booking_in, "model_fields_set", set()) or set()
                explicitly_requested_pricing = bool(
                    explicit_fields.intersection({"player_type", "gender", "birth_date", "age", "holes", "auto_price"})
                )
                inferred_pricing_context = player_type is not None or getattr(booking_in, "member_id", None) is not None or getattr(booking_in, "player_email", None) is not None

                if explicitly_requested_pricing or inferred_pricing_context:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "message": "Unable to auto-select a golf fee for this booking. Provide fee_category_id (or correct player details).",
                            "context": {
                                "player_type": player_type,
                                "gender": gender,
                                "holes": holes,
                                "age": age,
                                "tee_time": tee_time.tee_time.isoformat(),
                            },
                        },
                    )
        except HTTPException:
            raise
        except Exception as e:
            # Backward-compatible fallback if pricing columns/migrations aren't present yet.
            print(f"[PRICING] Auto-pricing skipped: {str(e)[:120]}")

    # Optional cart add-on (auto-selected) when requested and no explicit total price was provided.
    cart_requested = bool(getattr(booking_in, "cart", False))
    if cart_requested and getattr(booking_in, "price", None) is None:
        try:
            cart_player_type = getattr(booking_in, "player_type", None)
            if not cart_player_type:
                cart_player_type = "member" if resolved_member_id else "visitor"

            holes = int(getattr(booking_in, "holes", None) or 18)

            cart_fee = _select_cart_fee(db, tee_time.tee_time, cart_player_type, holes=holes)
            if not cart_fee:
                raise HTTPException(
                    status_code=400,
                    detail="Unable to auto-select a cart fee. Disable cart or choose a manual total price.",
                )

            cart_fee_price = float(cart_fee.price or 0.0)
            cart_charge = cart_fee_price
            cart_note = f"Cart: {cart_fee.description}"

            # Try to split cart fee across two players (one cart per two players).
            paired_booking = None
            existing_cart_bookings = db.query(models.Booking).filter(
                models.Booking.tee_time_id == booking_in.tee_time_id,
                models.Booking.status.notin_([models.BookingStatus.cancelled, models.BookingStatus.no_show]),
                models.Booking.notes.ilike("%Cart:%")
            ).order_by(models.Booking.created_at.desc()).all()

            for candidate in existing_cart_bookings:
                if _has_cart_note(candidate.notes) and not _cart_is_paired(candidate.notes):
                    paired_booking = candidate
                    break

            if paired_booking:
                paired_player_type = _infer_player_type_for_booking(paired_booking)
                pair_uses_member_rate = (cart_player_type == "member") or (paired_player_type == "member")

                target_cart_fee = _select_cart_fee(
                    db,
                    tee_time.tee_time,
                    "member" if pair_uses_member_rate else "visitor",
                    holes=holes
                ) or cart_fee

                target_cart_price = float(target_cart_fee.price or 0.0)
                paired_original_fee = _select_cart_fee(
                    db,
                    tee_time.tee_time,
                    paired_player_type,
                    holes=holes
                ) or target_cart_fee
                paired_original_price = float(paired_original_fee.price or 0.0)

                if target_cart_price > 0:
                    paired_booking.price = float(paired_booking.price or 0.0) - paired_original_price + (target_cart_price / 2)
                    paired_booking.notes = _append_note(paired_booking.notes, "Cart split (1/2)")
                    paired_booking.notes = _append_note(paired_booking.notes, "Cart paired")
                    if pair_uses_member_rate:
                        paired_booking.notes = _append_note(paired_booking.notes, "Cart rate: member")
                    if paired_booking.status in (models.BookingStatus.checked_in, models.BookingStatus.completed):
                        ensure_paid_ledger_entry(db, paired_booking)

                    cart_charge = target_cart_price / 2
                    cart_note = f"Cart: {target_cart_fee.description}"
                    cart_note = _append_note(cart_note, "Cart split (1/2)")
                    cart_note = _append_note(cart_note, "Cart paired")
                    if pair_uses_member_rate:
                        cart_note = _append_note(cart_note, "Cart rate: member")

            if cart_charge == cart_fee_price:
                cart_note = _append_note(cart_note, "Cart single")

            price = float(price or 0.0) + float(cart_charge or 0.0)
            notes_val = _append_note(notes_val, cart_note)
        except HTTPException:
            raise
        except Exception as e:
            print(f"[CART] Auto-cart skipped: {str(e)[:120]}")
     
    status = models.BookingStatus.checked_in if bool(getattr(booking_in, "prepaid", False)) else models.BookingStatus.booked

    b = models.Booking(
        tee_time_id=booking_in.tee_time_id,
        member_id=resolved_member_id,
        player_name=booking_in.player_name,
        player_email=booking_in.player_email,
        club_card=booking_in.club_card,
        handicap_number=getattr(booking_in, 'handicap_number', None),
        greenlink_id=getattr(booking_in, 'greenlink_id', None),
        source=getattr(booking_in, 'source', None) or models.BookingSource.proshop,
        external_provider=getattr(booking_in, 'external_provider', None),
        external_booking_id=getattr(booking_in, 'external_booking_id', None),
        party_size=party_size,
        fee_category_id=fee_category_id,
        price=price,
        status=status,
        notes=notes_val
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    
    # Record payment only once the booking is paid (checked-in/completed).
    if b.status in (models.BookingStatus.checked_in, models.BookingStatus.completed):
        # Get fee description for ledger
        fee_description = f"Green fee - {b.player_name}"
        if fee_category_id:
            if not resolved_fee_cat:
                from app.fee_models import FeeCategory
                resolved_fee_cat = db.query(FeeCategory).filter(FeeCategory.id == fee_category_id).first()
            if resolved_fee_cat:
                fee_description = resolved_fee_cat.description
        if getattr(b, "notes", None) and "Cart:" in str(getattr(b, "notes", "") or ""):
            fee_description = f"{fee_description} + Cart"

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

    if b.tee_time and is_day_closed(db, b.tee_time.tee_time.date()):
        raise HTTPException(status_code=403, detail="Tee sheet is closed for this date")

    if b.status in (models.BookingStatus.cancelled, models.BookingStatus.no_show):
        raise HTTPException(status_code=400, detail=f"Cannot check in booking with status '{b.status.value}'")

    # Mark paid/checked-in (idempotent)
    if b.status != models.BookingStatus.completed:
        b.status = models.BookingStatus.checked_in

    ensure_paid_ledger_entry(db, b)
    db.commit()
    db.refresh(b)

    # If an open round already exists, return it (idempotent).
    if b.round and b.round.handicap_sa_round_id:
        return {"booking": b, "round": b.round, "handicap_sa": {"round_id": b.round.handicap_sa_round_id, "success": True}}

    # Open round in Handicap SA
    handicap_result = handicap_sa.open_round(
        player_name=b.player_name,
        handicap_number=b.handicap_number or "N/A",
        greenlink_id=b.greenlink_id
    )

    # Create (or update) round with Handicap SA round ID
    r = b.round
    if not r:
        r = models.Round(booking_id=b.id)
        db.add(r)

    r.handicap_sa_round_id = handicap_result.get("round_id")
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
    ensure_paid_ledger_entry(db, b)
    db.commit()
    
    return r
