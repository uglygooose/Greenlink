from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import crud, models
from app.fee_models import FeeCategory, FeeType
from app.pricing import (
    PricingContext,
    infer_gender_from_values,
    normalize_gender,
    normalize_player_type,
    resolve_booking_pricing_profile,
    select_best_fee_from_list,
)


@dataclass(frozen=True)
class ResolvedBookingCharge:
    price: float
    fee_category_id: Optional[int]
    fee_category: Optional[FeeCategory]
    pricing_profile: Any
    source: str
    gender: Optional[str]
    unresolved: bool = False


@dataclass(frozen=True)
class BookingPricingRepairResult:
    resolved_by_booking_id: dict[int, ResolvedBookingCharge]
    updated_booking_ids: tuple[int, ...]


def _coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def _booking_source_value(booking: Any) -> str:
    raw = getattr(booking, "source", None)
    return str(getattr(raw, "value", raw) or "").strip().lower()


def booking_needs_pricing_repair(booking: Any) -> bool:
    price = _coerce_float(getattr(booking, "price", None))
    if price is not None and price > 0:
        return False
    if getattr(booking, "fee_category_id", None):
        return True
    if getattr(booking, "member_id", None):
        return True
    if normalize_player_type(getattr(booking, "player_type", None)):
        return True
    return _booking_source_value(booking) in {"external", "member"}


def resolve_booking_charge(
    *,
    tee_time: datetime,
    booking: Any,
    member: Any = None,
    fee_categories: Optional[Iterable[FeeCategory]] = None,
    fee_categories_by_id: Optional[dict[int, FeeCategory]] = None,
) -> ResolvedBookingCharge:
    membership_text = (
        getattr(member, "membership_category_raw", None)
        or getattr(member, "membership_category", None)
    )
    player_category = getattr(booking, "player_category", None) or getattr(member, "player_category", None)
    resolved_gender = (
        normalize_gender(getattr(booking, "gender", None))
        or normalize_gender(getattr(member, "gender", None))
        or infer_gender_from_values(membership_text, player_category)
    )
    pricing_profile = resolve_booking_pricing_profile(
        tee_time=tee_time,
        explicit_player_type=getattr(booking, "player_type", None),
        member=member,
        membership_category=membership_text,
        user_account_type=None,
        player_category=player_category,
        birth_date=getattr(member, "birth_date", None),
        age=None,
        has_member_link=bool(getattr(booking, "member_id", None)),
        handicap_sa_id=getattr(booking, "handicap_sa_id", None) or getattr(member, "handicap_sa_id", None),
        home_club=getattr(booking, "home_club", None) or getattr(member, "home_club", None),
    )

    current_price = _coerce_float(getattr(booking, "price", None))
    current_fee_category_id = int(getattr(booking, "fee_category_id", 0) or 0) or None
    fee_by_id = fee_categories_by_id or {}
    fee_category = fee_by_id.get(current_fee_category_id) if current_fee_category_id else None

    if fee_category is not None:
        if current_price is not None and current_price > 0:
            source = "booking_price" if abs(current_price - float(fee_category.price or 0.0)) > 0.009 else "fee_category"
            return ResolvedBookingCharge(
                price=float(current_price),
                fee_category_id=current_fee_category_id,
                fee_category=fee_category,
                pricing_profile=pricing_profile,
                source=source,
                gender=resolved_gender,
            )
        return ResolvedBookingCharge(
            price=float(fee_category.price or 0.0),
            fee_category_id=current_fee_category_id,
            fee_category=fee_category,
            pricing_profile=pricing_profile,
            source="fee_category",
            gender=resolved_gender,
        )

    if current_price is not None and current_price > 0:
        return ResolvedBookingCharge(
            price=float(current_price),
            fee_category_id=current_fee_category_id,
            fee_category=None,
            pricing_profile=pricing_profile,
            source="booking_price",
            gender=resolved_gender,
        )

    fee_category = None
    if fee_categories is not None:
        fee_category = select_best_fee_from_list(
            fee_categories,
            PricingContext(
                fee_type=FeeType.GOLF,
                tee_time=tee_time,
                player_type=normalize_player_type(getattr(pricing_profile, "player_type", None)),
                gender=resolved_gender,
                holes=int(getattr(booking, "holes", None) or 18),
                age=getattr(pricing_profile, "age", None),
                pricing_tags=getattr(pricing_profile, "pricing_tags", ()) or (),
            ),
        )

    if fee_category is not None:
        return ResolvedBookingCharge(
            price=float(fee_category.price or 0.0),
            fee_category_id=int(getattr(fee_category, "id", 0) or 0) or None,
            fee_category=fee_category,
            pricing_profile=pricing_profile,
            source="pricing_matrix",
            gender=resolved_gender,
        )

    fallback_price = float(current_price or 0.0)
    return ResolvedBookingCharge(
        price=fallback_price,
        fee_category_id=current_fee_category_id,
        fee_category=None,
        pricing_profile=pricing_profile,
        source="unresolved",
        gender=resolved_gender,
        unresolved=fallback_price <= 0,
    )


def repair_bookings_pricing(
    db: Session,
    bookings: Iterable[Any],
    *,
    tee_times_by_id: Optional[dict[int, datetime]] = None,
    persist: bool = False,
) -> BookingPricingRepairResult:
    rows = [booking for booking in bookings if booking is not None]
    if not rows:
        return BookingPricingRepairResult(resolved_by_booking_id={}, updated_booking_ids=())

    member_ids = {
        int(getattr(booking, "member_id", 0) or 0)
        for booking in rows
        if int(getattr(booking, "member_id", 0) or 0) > 0
    }
    members_by_id: dict[int, Any] = {}
    if member_ids:
        members_by_id = {
            int(getattr(member, "id", 0) or 0): member
            for member in db.query(models.Member).filter(models.Member.id.in_(sorted(member_ids))).all()
        }

    club_id = int(getattr(db, "info", {}).get("club_id") or 0) or None
    fee_query = db.query(FeeCategory).filter(FeeCategory.active == 1, FeeCategory.fee_type == FeeType.GOLF)
    if club_id:
        fee_query = fee_query.filter(or_(FeeCategory.club_id == club_id, FeeCategory.club_id.is_(None)))
    fee_categories = fee_query.all()
    fee_categories_by_id = {
        int(getattr(fee, "id", 0) or 0): fee
        for fee in fee_categories
        if int(getattr(fee, "id", 0) or 0) > 0
    }

    referenced_fee_ids = {
        int(getattr(booking, "fee_category_id", 0) or 0)
        for booking in rows
        if int(getattr(booking, "fee_category_id", 0) or 0) > 0
    }
    missing_fee_ids = sorted(fid for fid in referenced_fee_ids if fid not in fee_categories_by_id)
    if missing_fee_ids:
        extra_fees = db.query(FeeCategory).filter(FeeCategory.id.in_(missing_fee_ids)).all()
        for fee in extra_fees:
            fee_id = int(getattr(fee, "id", 0) or 0)
            if fee_id > 0:
                fee_categories_by_id[fee_id] = fee

    resolved_by_booking_id: dict[int, ResolvedBookingCharge] = {}
    updated_booking_ids: list[int] = []
    paid_statuses = {models.BookingStatus.checked_in, models.BookingStatus.completed}

    for booking in rows:
        booking_id = int(getattr(booking, "id", 0) or 0)
        if booking_id <= 0:
            continue
        tee_time = None
        tee_time_id = int(getattr(booking, "tee_time_id", 0) or 0)
        if tee_times_by_id and tee_time_id in tee_times_by_id:
            tee_time = tee_times_by_id[tee_time_id]
        elif getattr(getattr(booking, "tee_time", None), "tee_time", None) is not None:
            tee_time = booking.tee_time.tee_time
        if tee_time is None:
            continue

        member = members_by_id.get(int(getattr(booking, "member_id", 0) or 0))
        resolved = resolve_booking_charge(
            tee_time=tee_time,
            booking=booking,
            member=member,
            fee_categories=fee_categories,
            fee_categories_by_id=fee_categories_by_id,
        )
        resolved_by_booking_id[booking_id] = resolved

        if not booking_needs_pricing_repair(booking) or resolved.unresolved:
            continue

        current_price = _coerce_float(getattr(booking, "price", None))
        current_fee_category_id = int(getattr(booking, "fee_category_id", 0) or 0) or None
        current_player_type = normalize_player_type(getattr(booking, "player_type", None))

        changed = False
        if current_price is None or current_price <= 0 or abs(float(current_price) - float(resolved.price)) > 0.009:
            changed = True
        if resolved.fee_category_id and current_fee_category_id != resolved.fee_category_id:
            changed = True
        resolved_player_type = normalize_player_type(getattr(resolved.pricing_profile, "player_type", None))
        if resolved_player_type and not current_player_type:
            changed = True
        if resolved.gender and not normalize_gender(getattr(booking, "gender", None)):
            changed = True

        if changed:
            updated_booking_ids.append(booking_id)
            if persist:
                if current_price is None or current_price <= 0 or abs(float(current_price) - float(resolved.price)) > 0.009:
                    booking.price = float(resolved.price)
                if resolved.fee_category_id and current_fee_category_id != resolved.fee_category_id:
                    booking.fee_category_id = int(resolved.fee_category_id)
                if resolved_player_type and not current_player_type:
                    booking.player_type = resolved_player_type
                if resolved.gender and not normalize_gender(getattr(booking, "gender", None)):
                    booking.gender = resolved.gender
                if getattr(booking, "status", None) in paid_statuses:
                    crud.ensure_paid_ledger_entry(db, booking)

    if updated_booking_ids and persist:
        db.commit()

    return BookingPricingRepairResult(
        resolved_by_booking_id=resolved_by_booking_id,
        updated_booking_ids=tuple(updated_booking_ids),
    )
