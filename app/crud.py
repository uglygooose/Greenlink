from __future__ import annotations
# app/crud.py
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime
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
    pt = getattr(booking, "player_type", None)
    if pt:
        try:
            from app.pricing import normalize_player_type
            n = normalize_player_type(pt)
            if n:
                return n
        except Exception:
            return str(pt)
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

def _select_push_cart_fee(db: Session, tee_time, player_type: str, holes: int = 18):
    from app.fee_models import FeeType
    from app.pricing import PricingContext, normalize_player_type, select_best_fee_category

    ctx = PricingContext(
        fee_type=FeeType.PUSH_CART,
        tee_time=tee_time,
        player_type=normalize_player_type(player_type),
        holes=holes,
    )
    return select_best_fee_category(db, ctx)

def _select_caddy_fee(db: Session, tee_time, player_type: str, holes: int = 18):
    from app.fee_models import FeeType
    from app.pricing import PricingContext, normalize_player_type, select_best_fee_category

    ctx = PricingContext(
        fee_type=FeeType.CADDY,
        tee_time=tee_time,
        player_type=normalize_player_type(player_type),
        holes=holes,
    )
    return select_best_fee_category(db, ctx)

def ensure_paid_ledger_entry(db: Session, booking: models.Booking, payment_method: str | None = None) -> models.LedgerEntry | None:
    """
    Ensure a single ledger entry exists once a booking is considered paid.
    Payment is assumed when status is checked_in/completed.
    """
    if not booking or not booking.id:
        return None

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
    if bool(getattr(booking, "cart", False)) or "Cart:" in notes:
        description = f"{description} + Cart"
    if bool(getattr(booking, "push_cart", False)):
        description = f"{description} + Push Cart"
    if bool(getattr(booking, "caddy", False)):
        description = f"{description} + Caddy"
    amount = float(getattr(booking, "price", None) or 0.0)

    def _upsert_meta(ledger_entry_id: int, method: str) -> None:
        raw = (method or "").strip().upper()
        if not raw:
            return
        meta = db.query(models.LedgerEntryMeta).filter(models.LedgerEntryMeta.ledger_entry_id == ledger_entry_id).first()
        if meta:
            meta.payment_method = raw
            meta.updated_at = datetime.utcnow()
            return
        db.add(models.LedgerEntryMeta(ledger_entry_id=ledger_entry_id, payment_method=raw))

    existing = db.query(models.LedgerEntry).filter(models.LedgerEntry.booking_id == booking.id).first()
    if existing:
        existing.description = description
        existing.amount = amount
        if payment_method:
            _upsert_meta(existing.id, payment_method)
        return existing

    le = models.LedgerEntry(booking_id=booking.id, description=description, amount=amount)
    db.add(le)
    db.flush()
    if payment_method:
        _upsert_meta(le.id, payment_method)
    return le

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

    home_club = (getattr(user, "home_club", None) or "").strip() or None
    gender = (getattr(user, "gender", None) or "").strip() or None
    player_category = (getattr(user, "player_category", None) or "").strip() or None
    phone = (getattr(user, "phone", None) or "").strip() or None
    account_type = (getattr(user, "account_type", None) or "").strip().lower() or None
    if account_type:
        try:
            from app.pricing import normalize_player_type
            account_type = normalize_player_type(account_type)
        except Exception:
            pass
    if account_type not in {None, "member", "visitor", "non_affiliated"}:
        account_type = None
    student_flag = getattr(user, "student", None)
    if student_flag is None and player_category:
        student_flag = player_category.lower() == "student"

    db_user = models.User(
        name=user.name,
        email=str(user.email).strip().lower(),
        password=hashed,
        phone=phone,
        account_type=account_type,
        handicap_sa_id=(getattr(user, "handicap_sa_id", None) or "").strip() or None,
        handicap_number=(getattr(user, "handicap_number", None) or "").strip() or None,
        handicap_index=getattr(user, "handicap_index", None),
        home_course=home_club,  # UI calls this "Home club"
        gender=gender,
        player_category=player_category,
        student=student_flag,
    )

    birth_date = getattr(user, "birth_date", None)
    if birth_date:
        try:
            db_user.birth_date = datetime.combine(birth_date, datetime.min.time())
        except Exception:
            pass
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # Optional: upsert a "members" row so the pro-shop member search can find them by email.
    if bool(getattr(user, "create_member_profile", False)) or getattr(user, "member_number", None) or getattr(user, "phone", None):
        email = str(db_user.email or "").strip().lower()
        if email:
            first = (user.name or "").strip().split(" ")[0] if (user.name or "").strip() else "Member"
            last = (user.name or "").strip().split(" ", 1)[1] if " " in (user.name or "").strip() else "Unknown"

            member = db.query(models.Member).filter(func.lower(models.Member.email) == email).first()
            if not member:
                member = models.Member(first_name=first, last_name=last, email=email, active=1)
                db.add(member)

            member.phone = (getattr(user, "phone", None) or member.phone or "").strip() or None
            member.member_number = (getattr(user, "member_number", None) or member.member_number or "").strip() or None
            member.handicap_number = (getattr(user, "handicap_number", None) or member.handicap_number or "").strip() or None
            member.home_club = (getattr(user, "home_club", None) or member.home_club or "").strip() or None
            member.handicap_sa_id = (getattr(user, "handicap_sa_id", None) or member.handicap_sa_id or "").strip() or None
            if getattr(user, "handicap_index", None) is not None:
                member.handicap_index = float(user.handicap_index)
            member.gender = gender or member.gender
            member.player_category = player_category or member.player_category
            member.student = student_flag if student_flag is not None else member.student

            db.commit()

    return db_user

def authenticate_user(db: Session, email: str, password: str):
    normalized_email = (email or "").strip().lower()
    user = db.query(models.User).filter(func.lower(models.User.email) == normalized_email).first()
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

def create_booking(db: Session, booking_in: schemas.BookingCreate, current_user: models.User | None = None):
    # Validate tee time exists
    tee_time = db.query(models.TeeTime).filter(models.TeeTime.id == booking_in.tee_time_id).first()
    if not tee_time:
        raise HTTPException(status_code=404, detail="Tee time not found")

    if is_day_closed(db, tee_time.tee_time.date()):
        raise HTTPException(status_code=403, detail="Tee sheet is closed for this date")

    # Enforce player booking window (admins bypass).
    if current_user is not None:
        try:
            from app.booking_rules import get_booking_window_for_user
            from app.models import UserRole

            if getattr(current_user, "role", None) != UserRole.admin:
                _, window_days, max_date = get_booking_window_for_user(db, current_user)
                if tee_time.tee_time.date() > max_date:
                    raise HTTPException(
                        status_code=403,
                        detail=f"Booking window exceeded. You can book up to {window_days} days ahead.",
                    )
        except HTTPException:
            raise
        except Exception:
            # Do not block bookings if settings are unavailable.
            pass

    # Capacity enforcement
    party_size = booking_in.party_size or 1
    # Cancelled/no-show bookings should not block capacity.
    occupying_statuses = [
        models.BookingStatus.booked,
        models.BookingStatus.checked_in,
        models.BookingStatus.completed,
    ]
    existing_bookings = (
        db.query(models.Booking)
        .filter(
            models.Booking.tee_time_id == booking_in.tee_time_id,
            or_(
                models.Booking.status.is_(None),
                models.Booking.status.in_(occupying_statuses),
            ),
        )
        .all()
    )
    existing_total = sum((b.party_size or 1) for b in existing_bookings)
    if existing_total + party_size > (tee_time.capacity or 4):
        raise HTTPException(status_code=409, detail="Tee time capacity exceeded")

    # Resolve member link (explicit id or match by email)
    resolved_member_id = getattr(booking_in, "member_id", None)
    resolved_user = None
    if not resolved_member_id and getattr(booking_in, "player_email", None):
        email = str(booking_in.player_email).strip().lower()
        if email:
            resolved_user = db.query(models.User).filter(func.lower(models.User.email) == email).first()
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
    else:
        member = None

    # Resolve registered user (player profile) by email when available.
    if resolved_user is None and getattr(booking_in, "player_email", None):
        email = str(booking_in.player_email).strip().lower()
        if email:
            resolved_user = db.query(models.User).filter(func.lower(models.User.email) == email).first()

    # Booking attributes (persisted for reporting)
    holes = int(getattr(booking_in, "holes", None) or 18)
    holes = 9 if holes == 9 else 18
    prepaid = bool(getattr(booking_in, "prepaid", False))
    cart_required = bool(getattr(booking_in, "cart", False))
    push_cart_required = bool(getattr(booking_in, "push_cart", False))
    caddy_required = bool(getattr(booking_in, "caddy", False))

    # Snapshot profile fields for reporting (manual inputs win, then user, then member)
    handicap_sa_id = getattr(booking_in, "handicap_sa_id", None) or getattr(resolved_user, "handicap_sa_id", None) or getattr(member, "handicap_sa_id", None)
    home_club = getattr(booking_in, "home_club", None) or getattr(resolved_user, "home_course", None) or getattr(member, "home_club", None)
    gender_val = getattr(booking_in, "gender", None) or getattr(resolved_user, "gender", None) or getattr(member, "gender", None)
    player_category_val = getattr(booking_in, "player_category", None) or getattr(resolved_user, "player_category", None) or getattr(member, "player_category", None)
    handicap_index = getattr(booking_in, "handicap_index", None)
    if handicap_index is None:
        handicap_index = getattr(resolved_user, "handicap_index", None)
    if handicap_index is None:
        handicap_index = getattr(member, "handicap_index", None)

    # Derive player category when not explicitly set:
    # - Pensioner when age >= 60 (SA common standard)
    # - Student when profile is explicitly marked student
    # - Otherwise Adult
    if not player_category_val:
        try:
            from app.pricing import compute_age

            # Determine age if we have a birth date.
            birth_date = getattr(booking_in, "birth_date", None)
            if not birth_date and resolved_user and getattr(resolved_user, "birth_date", None):
                birth_date = resolved_user.birth_date.date()
            age = compute_age(tee_time.tee_time.date(), birth_date) if birth_date else None

            if age is not None and int(age) >= 60:
                player_category_val = "pensioner"
            elif bool(getattr(resolved_user, "student", False)) or bool(getattr(member, "student", False)):
                player_category_val = "student"
            else:
                player_category_val = "adult"
        except Exception:
            player_category_val = "adult"

    # Snapshot the pricing audience ("member", "visitor", "non_affiliated") so reporting and
    # reconciliation remain stable even if the user's profile changes later.
    try:
        from app.pricing import normalize_player_type
    except Exception:
        def normalize_player_type(v):  # type: ignore[misc]
            return (str(v).strip().lower() if v is not None else None) or None

    player_type_snapshot = normalize_player_type(getattr(booking_in, "player_type", None))
    if not player_type_snapshot:
        if resolved_member_id or getattr(booking_in, "member_id", None):
            player_type_snapshot = "member"
        elif resolved_user and getattr(resolved_user, "account_type", None):
            player_type_snapshot = normalize_player_type(getattr(resolved_user, "account_type", None))
        elif handicap_sa_id or home_club:
            # Having an HNA SA Player ID or a home club implies affiliation (discounted visitor rate).
            player_type_snapshot = "visitor"
        else:
            # Default: non-affiliated visitor rate.
            player_type_snapshot = "non_affiliated"

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
            holes = int(getattr(booking_in, "holes", None) or holes or 18)

            # Infer player type when possible
            if not player_type:
                player_type = player_type_snapshot

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
                cart_player_type = player_type_snapshot or ("member" if resolved_member_id else "visitor")

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
                    paired_charge = target_cart_price / 2
                    paired_booking.price = float(paired_booking.price or 0.0) - paired_original_price + (target_cart_price / 2)
                    paired_booking.notes = _append_note(paired_booking.notes, "Cart split (1/2)")
                    paired_booking.notes = _append_note(paired_booking.notes, "Cart paired")
                    paired_booking.notes = _append_note(paired_booking.notes, f"Cart amount: {paired_charge:.2f}")
                    if pair_uses_member_rate:
                        paired_booking.notes = _append_note(paired_booking.notes, "Cart rate: member")
                    if paired_booking.status in (models.BookingStatus.checked_in, models.BookingStatus.completed):
                        ensure_paid_ledger_entry(db, paired_booking)

                    cart_charge = target_cart_price / 2
                    cart_note = f"Cart: {target_cart_fee.description}"
                    cart_note = _append_note(cart_note, "Cart split (1/2)")
                    cart_note = _append_note(cart_note, "Cart paired")
                    cart_note = _append_note(cart_note, f"Cart amount: {cart_charge:.2f}")
                    if pair_uses_member_rate:
                        cart_note = _append_note(cart_note, "Cart rate: member")

            if cart_charge == cart_fee_price:
                cart_note = _append_note(cart_note, "Cart single")
                cart_note = _append_note(cart_note, f"Cart amount: {cart_charge:.2f}")

            price = float(price or 0.0) + float(cart_charge or 0.0)
            notes_val = _append_note(notes_val, cart_note)
        except HTTPException:
            raise
        except Exception as e:
            print(f"[CART] Auto-cart skipped: {str(e)[:120]}")

    # Optional push cart add-on (auto-selected) when requested and no explicit total price was provided.
    push_cart_requested = bool(getattr(booking_in, "push_cart", False))
    if push_cart_requested and getattr(booking_in, "price", None) is None:
        try:
            push_player_type = getattr(booking_in, "player_type", None) or player_type_snapshot or ("member" if resolved_member_id else "visitor")
            holes = int(getattr(booking_in, "holes", None) or 18)

            push_fee = _select_push_cart_fee(db, tee_time.tee_time, push_player_type, holes=holes)
            if not push_fee:
                raise HTTPException(
                    status_code=400,
                    detail="Unable to auto-select a push cart fee. Disable push cart or choose a manual total price.",
                )

            push_charge = float(push_fee.price or 0.0)
            if push_charge:
                price = float(price or 0.0) + float(push_charge)
            notes_val = _append_note(notes_val, f"Push cart: {push_fee.description}")
            notes_val = _append_note(notes_val, f"Push cart amount: {push_charge:.2f}")
        except HTTPException:
            raise
        except Exception as e:
            print(f"[PUSH_CART] Auto-push-cart skipped: {str(e)[:120]}")

    # Optional caddy add-on (auto-selected) when requested and no explicit total price was provided.
    caddy_requested = bool(getattr(booking_in, "caddy", False))
    if caddy_requested and getattr(booking_in, "price", None) is None:
        try:
            caddy_player_type = getattr(booking_in, "player_type", None) or player_type_snapshot or ("member" if resolved_member_id else "visitor")
            holes = int(getattr(booking_in, "holes", None) or 18)

            caddy_fee = _select_caddy_fee(db, tee_time.tee_time, caddy_player_type, holes=holes)
            if not caddy_fee:
                raise HTTPException(
                    status_code=400,
                    detail="Unable to auto-select a caddy fee. Disable caddy or choose a manual total price.",
                )

            caddy_charge = float(caddy_fee.price or 0.0)
            if caddy_charge:
                price = float(price or 0.0) + float(caddy_charge)
            notes_val = _append_note(notes_val, f"Caddy: {caddy_fee.description}")
            notes_val = _append_note(notes_val, f"Caddy amount: {caddy_charge:.2f}")
        except HTTPException:
            raise
        except Exception as e:
            print(f"[CADDY] Auto-caddy skipped: {str(e)[:120]}")
     
    status = models.BookingStatus.checked_in if prepaid else models.BookingStatus.booked

    b = models.Booking(
        tee_time_id=booking_in.tee_time_id,
        member_id=resolved_member_id,
        created_by_user_id=getattr(current_user, "id", None) if current_user is not None else None,
        player_name=booking_in.player_name,
        player_email=booking_in.player_email,
        club_card=booking_in.club_card,
        handicap_number=getattr(booking_in, "handicap_number", None),
        greenlink_id=getattr(booking_in, "greenlink_id", None),
        handicap_sa_id=handicap_sa_id,
        home_club=home_club,
        player_type=player_type_snapshot,
        source=getattr(booking_in, "source", None) or models.BookingSource.proshop,
        external_provider=getattr(booking_in, "external_provider", None),
        external_booking_id=getattr(booking_in, "external_booking_id", None),
        party_size=party_size,
        fee_category_id=fee_category_id,
        price=price,
        status=status,
        holes=holes,
        prepaid=prepaid,
        cart=cart_required,
        push_cart=push_cart_required,
        caddy=caddy_required,
        gender=gender_val,
        player_category=player_category_val,
        handicap_index_at_booking=handicap_index,
        notes=notes_val,
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
        notes = str(getattr(b, "notes", "") or "")
        if bool(getattr(b, "cart", False)) or ("Cart:" in notes):
            fee_description = f"{fee_description} + Cart"
        if bool(getattr(b, "push_cart", False)):
            fee_description = f"{fee_description} + Push Cart"
        if bool(getattr(b, "caddy", False)):
            fee_description = f"{fee_description} + Caddy"

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

def checkin_booking(db: Session, booking_id: int, payment_method: str | None = None):
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

    ensure_paid_ledger_entry(db, b, payment_method=payment_method)
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
