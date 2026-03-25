from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import String, asc, case, cast, desc, func, or_
from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus, Round, TeeTime, User, UserRole


def list_players_payload(
    db: Session,
    *,
    skip: int = 0,
    limit: int = 50,
    q: str | None = None,
) -> dict[str, Any]:
    base_query = db.query(User).filter(User.role == UserRole.player)
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        base_query = base_query.filter(
            or_(
                func.lower(User.name).like(like),
                func.lower(User.email).like(like),
                func.lower(User.handicap_number).like(like),
                func.lower(User.greenlink_id).like(like),
            )
        )

    total = base_query.count()
    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]
    bookings_count_expr = func.count(Booking.id)
    total_spent_expr = func.coalesce(
        func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)),
        0.0,
    )

    players = (
        db.query(
            User.id.label("id"),
            User.name.label("name"),
            User.email.label("email"),
            User.handicap_number.label("handicap_number"),
            User.greenlink_id.label("greenlink_id"),
            User.handicap_sa_id.label("handicap_sa_id"),
            User.home_course.label("home_course"),
            User.gender.label("gender"),
            User.player_category.label("player_category"),
            User.handicap_index.label("handicap_index"),
            bookings_count_expr.label("bookings_count"),
            total_spent_expr.label("total_spent"),
        )
        .outerjoin(Booking, Booking.player_email == User.email)
        .filter(User.role == UserRole.player)
    )
    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        players = players.filter(
            or_(
                func.lower(User.name).like(like),
                func.lower(User.email).like(like),
                func.lower(User.handicap_number).like(like),
                func.lower(User.greenlink_id).like(like),
            )
        )

    players = (
        players.group_by(
            User.id,
            User.name,
            User.email,
            User.handicap_number,
            User.greenlink_id,
            User.handicap_sa_id,
            User.home_course,
            User.gender,
            User.player_category,
            User.handicap_index,
        )
        .order_by(desc(User.id))
        .offset(int(skip))
        .limit(int(limit))
        .all()
    )
    return {
        "total": total,
        "players": [
            {
                "id": row.id,
                "name": row.name,
                "email": row.email,
                "handicap_number": row.handicap_number,
                "greenlink_id": row.greenlink_id,
                "handicap_sa_id": getattr(row, "handicap_sa_id", None),
                "home_course": getattr(row, "home_course", None),
                "gender": getattr(row, "gender", None),
                "player_category": getattr(row, "player_category", None),
                "handicap_index": float(getattr(row, "handicap_index", None)) if getattr(row, "handicap_index", None) is not None else None,
                "bookings_count": int(row.bookings_count or 0),
                "total_spent": float(row.total_spent or 0.0),
            }
            for row in players
        ],
    }


def list_guests_payload(
    db: Session,
    *,
    skip: int = 0,
    limit: int = 50,
    q: str | None = None,
    guest_type: str | None = None,
    sort: str | None = "recent_activity",
) -> dict[str, Any]:
    paid_statuses = [BookingStatus.checked_in, BookingStatus.completed]
    guest_key = func.lower(func.coalesce(Booking.player_email, cast(Booking.player_name, String)))
    last_seen_expr = func.max(TeeTime.tee_time)

    query = (
        db.query(
            guest_key.label("guest_key"),
            func.max(Booking.player_name).label("name"),
            func.max(Booking.player_email).label("email"),
            func.max(Booking.handicap_number).label("handicap_number"),
            func.count(Booking.id).label("bookings_count"),
            func.coalesce(
                func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)),
                0.0,
            ).label("total_spent"),
            last_seen_expr.label("last_seen"),
        )
        .outerjoin(TeeTime, Booking.tee_time_id == TeeTime.id)
        .filter(Booking.member_id.is_(None))
    )

    guest_type_key = (guest_type or "").strip().lower()
    if guest_type_key in {"affiliated", "affiliate", "visitor"}:
        query = query.filter(or_(Booking.player_type.is_(None), Booking.player_type.in_(["visitor", "reciprocity"])))
    elif guest_type_key in {"non_affiliated", "non-affiliated", "nonaffiliated"}:
        query = query.filter(Booking.player_type == "non_affiliated")

    if q:
        needle = q.strip().lower()
        like = f"%{needle}%"
        query = query.filter(
            or_(
                func.lower(Booking.player_name).like(like),
                func.lower(Booking.player_email).like(like),
                func.lower(Booking.handicap_number).like(like),
            )
        )

    query = query.group_by(guest_key)
    total = query.count()

    sort_key = str(sort or "recent_activity").strip().lower()
    if sort_key == "bookings_desc":
        order = [desc(func.count(Booking.id)), desc(last_seen_expr)]
    elif sort_key == "spend_desc":
        order = [desc(func.coalesce(func.sum(case((Booking.status.in_(paid_statuses), Booking.price), else_=0.0)), 0.0)), desc(last_seen_expr)]
    elif sort_key == "name_desc":
        order = [desc(func.max(Booking.player_name))]
    elif sort_key == "name_asc":
        order = [asc(func.max(Booking.player_name))]
    else:
        order = [desc(last_seen_expr)]

    rows = query.order_by(*order).offset(int(skip)).limit(int(limit)).all()
    return {
        "total": total,
        "guests": [
            {
                "key": guest_key_value,
                "name": name,
                "email": email,
                "handicap_number": handicap_number,
                "bookings_count": int(bookings_count or 0),
                "total_spent": float(total_spent or 0.0),
                "last_seen": last_seen.isoformat() if last_seen else None,
            }
            for guest_key_value, name, email, handicap_number, bookings_count, total_spent, last_seen in rows
        ],
    }


def get_player_detail_payload(db: Session, *, player_id: int) -> dict[str, Any]:
    player = db.query(User).filter(User.id == int(player_id), User.role == UserRole.player).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    bookings = db.query(Booking).filter(Booking.player_email == player.email).order_by(desc(Booking.created_at)).all()
    total_spent = db.query(func.sum(Booking.price)).filter(Booking.player_email == player.email).scalar() or 0.0
    completed_rounds = (
        db.query(func.count(Round.id))
        .join(Booking)
        .filter(Booking.player_email == player.email, Round.closed == 1)
        .scalar()
        or 0
    )
    return {
        "id": player.id,
        "name": player.name,
        "email": player.email,
        "handicap_number": player.handicap_number,
        "greenlink_id": player.greenlink_id,
        "handicap_sa_id": getattr(player, "handicap_sa_id", None),
        "home_course": getattr(player, "home_course", None),
        "gender": getattr(player, "gender", None),
        "player_category": getattr(player, "player_category", None),
        "handicap_index": float(getattr(player, "handicap_index", None)) if getattr(player, "handicap_index", None) is not None else None,
        "total_spent": float(total_spent),
        "bookings_count": len(bookings),
        "completed_rounds": completed_rounds,
        "recent_bookings": [
            {
                "id": booking.id,
                "price": float(booking.price),
                "status": booking.status,
                "tee_time": booking.tee_time.tee_time.isoformat() if booking.tee_time else None,
                "created_at": booking.created_at.isoformat(),
            }
            for booking in bookings[:10]
        ],
    }
