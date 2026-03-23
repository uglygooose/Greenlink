# app/routers/scoring.py
from __future__ import annotations

import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app import crud, models, schemas
from app.auth import get_current_user, get_db
from app.integrations import handicap_sa
from app.tenancy import get_active_club_id, require_staff_like

router = APIRouter(prefix="/scoring", tags=["scoring"])


@router.post("/submit")
def submit(
    round_in: schemas.RoundCreate,
    db: Session = Depends(get_db),
    _=Depends(require_staff_like),
    __: int = Depends(get_active_club_id),
):
    r = crud.submit_scores(db, round_in.booking_id, round_in.scores_json or "")
    return {"round_id": r.id, "closed": r.closed}


class PlayerRoundOpenPayload(BaseModel):
    booking_id: int
    scoring_mode: str = "hole_by_hole"  # hole_by_hole | adjusted_gross


class PlayerRoundSubmitPayload(BaseModel):
    scoring_mode: str | None = None
    scores_json: str | None = None
    adjusted_gross: int | None = None
    holes_played: int | None = None
    no_return: bool = False


def _require_player(current_user: models.User = Depends(get_current_user)) -> models.User:
    if getattr(current_user, "role", None) != models.UserRole.player:
        raise HTTPException(status_code=403, detail="Player access required")
    return current_user


def _normalize_scoring_mode(value: str | None) -> str:
    mode = str(value or "").strip().lower()
    if mode in {"adjusted", "adjusted_gross", "gross"}:
        return "adjusted_gross"
    return "hole_by_hole"


def _linked_member_for_user(db: Session, user: models.User, club_id: int) -> models.Member | None:
    email = str(getattr(user, "email", "") or "").strip().lower()
    if email:
        row = (
            db.query(models.Member)
            .filter(models.Member.club_id == int(club_id), func.lower(models.Member.email) == email, models.Member.active == 1)
            .first()
        )
        if row:
            return row

    handicap_sa_id = str(getattr(user, "handicap_sa_id", "") or "").strip().lower()
    if handicap_sa_id:
        row = (
            db.query(models.Member)
            .filter(models.Member.club_id == int(club_id), func.lower(models.Member.handicap_sa_id) == handicap_sa_id, models.Member.active == 1)
            .first()
        )
        if row:
            return row

    return None


def _booking_owner_predicate(user: models.User, member: models.Member | None):
    predicates = []
    try:
        uid = int(getattr(user, "id", None) or 0)
    except Exception:
        uid = 0
    if uid > 0:
        predicates.append(models.Booking.created_by_user_id == uid)

    email = str(getattr(user, "email", "") or "").strip().lower()
    if email:
        predicates.append(func.lower(models.Booking.player_email) == email)

    if member is not None and getattr(member, "id", None):
        predicates.append(models.Booking.member_id == int(member.id))

    handicap_sa_id = str(getattr(user, "handicap_sa_id", "") or "").strip().lower()
    if handicap_sa_id:
        predicates.append(func.lower(models.Booking.handicap_sa_id) == handicap_sa_id)

    if not predicates:
        return models.Booking.id == -1
    return or_(*predicates)


def _parse_scores_json(raw: str | None) -> dict:
    text = str(raw or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
        return {"scores_raw": text}
    except Exception:
        return {"scores_raw": text}


def _serialize_round(booking: models.Booking, round_row: models.Round | None) -> dict:
    payload = _parse_scores_json(getattr(round_row, "scores_json", None) if round_row else None)
    mode = _normalize_scoring_mode(payload.get("mode"))
    return {
        "booking_id": int(getattr(booking, "id", 0) or 0),
        "tee_time_id": int(getattr(booking, "tee_time_id", 0) or 0),
        "tee_time": (
            booking.tee_time.tee_time.isoformat()
            if getattr(getattr(booking, "tee_time", None), "tee_time", None)
            else None
        ),
        "player_name": str(getattr(booking, "player_name", "") or ""),
        "status": str(getattr(getattr(booking, "status", None), "value", getattr(booking, "status", None)) or "booked"),
        "member_id": getattr(booking, "member_id", None),
        "handicap_sa_id": getattr(booking, "handicap_sa_id", None),
        "handicap_index_at_booking": getattr(booking, "handicap_index_at_booking", None),
        "handicap_index_at_play": getattr(booking, "handicap_index_at_play", None),
        "round": (
            {
                "id": int(getattr(round_row, "id", 0) or 0),
                "mode": mode,
                "closed": bool(getattr(round_row, "closed", 0)),
                "handicap_sa_round_id": getattr(round_row, "handicap_sa_round_id", None),
                "handicap_synced": bool(getattr(round_row, "handicap_synced", 0)),
                "adjusted_gross": payload.get("adjusted_gross"),
                "holes_played": payload.get("holes_played"),
                "no_return": bool(payload.get("no_return", False)),
                "committee_review_required": bool(payload.get("committee_review_required", False)),
                "submitted_at": payload.get("submitted_at"),
            }
            if round_row
            else None
        ),
    }


def _sync_booking_identity(booking: models.Booking, user: models.User, member: models.Member | None) -> None:
    if booking.member_id is None and member is not None and getattr(member, "id", None):
        booking.member_id = int(member.id)

    if not str(getattr(booking, "handicap_sa_id", "") or "").strip():
        booking.handicap_sa_id = (
            str(getattr(user, "handicap_sa_id", "") or "").strip()
            or str(getattr(member, "handicap_sa_id", "") or "").strip()
            or None
        )

    if getattr(booking, "handicap_index_at_play", None) is None:
        user_index = getattr(user, "handicap_index", None)
        member_index = getattr(member, "handicap_index", None) if member is not None else None
        if user_index is not None:
            booking.handicap_index_at_play = float(user_index)
        elif member_index is not None:
            booking.handicap_index_at_play = float(member_index)


def _load_owned_booking(db: Session, booking_id: int, user: models.User, club_id: int) -> tuple[models.Booking, models.Member | None]:
    member = _linked_member_for_user(db, user, club_id)
    owner_filter = _booking_owner_predicate(user, member)
    booking = (
        db.query(models.Booking)
        .options(selectinload(models.Booking.tee_time), selectinload(models.Booking.round))
        .filter(models.Booking.id == int(booking_id), models.Booking.club_id == int(club_id), owner_filter)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking, member


def _load_owned_round(db: Session, round_id: int, user: models.User, club_id: int) -> tuple[models.Round, models.Booking, models.Member | None]:
    member = _linked_member_for_user(db, user, club_id)
    owner_filter = _booking_owner_predicate(user, member)
    round_row = (
        db.query(models.Round)
        .join(models.Booking, models.Round.booking_id == models.Booking.id)
        .options(selectinload(models.Round.booking).selectinload(models.Booking.tee_time))
        .filter(models.Round.id == int(round_id), models.Booking.club_id == int(club_id), owner_filter)
        .first()
    )
    if not round_row or not round_row.booking:
        raise HTTPException(status_code=404, detail="Round not found")
    return round_row, round_row.booking, member


@router.get("/my-bookings")
def list_my_bookings(
    days: int = Query(45, ge=1, le=365),
    include_past: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(_require_player),
    club_id: int = Depends(get_active_club_id),
):
    member = _linked_member_for_user(db, current_user, club_id)
    owner_filter = _booking_owner_predicate(current_user, member)
    today = datetime.utcnow().date()
    start_date = today - timedelta(days=days) if include_past else today
    end_date = today + timedelta(days=days)

    rows = (
        db.query(models.Booking)
        .join(models.TeeTime, models.Booking.tee_time_id == models.TeeTime.id)
        .options(selectinload(models.Booking.tee_time), selectinload(models.Booking.round))
        .filter(
            models.Booking.club_id == int(club_id),
            owner_filter,
            func.date(models.TeeTime.tee_time) >= start_date,
            func.date(models.TeeTime.tee_time) <= end_date,
        )
        .order_by(models.TeeTime.tee_time.desc(), models.Booking.id.desc())
        .all()
    )

    bookings = []
    for booking in rows:
        serialized = _serialize_round(booking, booking.round)
        raw_status = str(getattr(getattr(booking, "status", None), "value", getattr(booking, "status", None)) or "booked")
        can_open = raw_status not in {"cancelled", "no_show"} and not bool(getattr(getattr(booking, "round", None), "closed", 0))
        can_submit = bool(getattr(booking, "round", None)) and not bool(getattr(getattr(booking, "round", None), "closed", 0))
        serialized["can_open_round"] = can_open
        serialized["can_submit_round"] = can_submit
        bookings.append(serialized)

    return {
        "count": len(bookings),
        "bookings": bookings,
        "member_linked": bool(getattr(member, "id", None)),
        "member_number": getattr(member, "member_number", None),
        "handicap_sa_id": getattr(current_user, "handicap_sa_id", None) or getattr(member, "handicap_sa_id", None),
        "handicap_index": getattr(current_user, "handicap_index", None) if getattr(current_user, "handicap_index", None) is not None else getattr(member, "handicap_index", None),
    }


@router.get("/my-rounds")
def list_my_rounds(
    status: str = Query("all", description="all|open|closed"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(_require_player),
    club_id: int = Depends(get_active_club_id),
):
    member = _linked_member_for_user(db, current_user, club_id)
    owner_filter = _booking_owner_predicate(current_user, member)
    status_norm = str(status or "all").strip().lower()

    q = (
        db.query(models.Round)
        .join(models.Booking, models.Round.booking_id == models.Booking.id)
        .join(models.TeeTime, models.Booking.tee_time_id == models.TeeTime.id)
        .options(selectinload(models.Round.booking).selectinload(models.Booking.tee_time))
        .filter(models.Booking.club_id == int(club_id), owner_filter)
    )
    if status_norm == "open":
        q = q.filter(or_(models.Round.closed == 0, models.Round.closed.is_(None)))
    elif status_norm == "closed":
        q = q.filter(models.Round.closed == 1)

    rows = q.order_by(models.TeeTime.tee_time.desc(), models.Round.id.desc()).limit(int(limit)).all()
    return {
        "count": len(rows),
        "rounds": [_serialize_round(r.booking, r) for r in rows if getattr(r, "booking", None)],
    }


@router.post("/my-rounds/open")
def open_my_round(
    payload: PlayerRoundOpenPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(_require_player),
    club_id: int = Depends(get_active_club_id),
):
    booking, member = _load_owned_booking(db, int(payload.booking_id), current_user, club_id)
    status = str(getattr(getattr(booking, "status", None), "value", getattr(booking, "status", None)) or "booked")
    if status in {"cancelled", "no_show"}:
        raise HTTPException(status_code=400, detail=f"Cannot open round for {status} booking")

    round_row = booking.round
    mode = _normalize_scoring_mode(payload.scoring_mode)
    if round_row is None:
        round_row = models.Round(club_id=int(club_id), booking_id=booking.id, closed=0, handicap_synced=0)
        db.add(round_row)
        db.flush()
    elif bool(getattr(round_row, "closed", 0)):
        raise HTTPException(status_code=409, detail="Round already closed for this booking")
    elif getattr(round_row, "club_id", None) is None:
        round_row.club_id = int(club_id)

    _sync_booking_identity(booking, current_user, member)

    handicap_result = {"success": True, "status": "already_open"}
    if not str(getattr(round_row, "handicap_sa_round_id", "") or "").strip():
        handicap_number = (
            str(getattr(booking, "handicap_number", "") or "").strip()
            or str(getattr(current_user, "handicap_number", "") or "").strip()
            or str(getattr(member, "handicap_number", "") or "").strip()
            or "N/A"
        )
        try:
            handicap_result = handicap_sa.open_round(
                player_name=str(getattr(booking, "player_name", "") or ""),
                handicap_number=handicap_number,
                greenlink_id=getattr(current_user, "greenlink_id", None),
            )
            if bool(handicap_result.get("success")) and handicap_result.get("round_id"):
                round_row.handicap_sa_round_id = str(handicap_result["round_id"])
        except Exception as exc:
            handicap_result = {"success": False, "detail": str(exc)[:200]}

    payload_json = _parse_scores_json(getattr(round_row, "scores_json", None))
    payload_json["mode"] = mode
    payload_json["state"] = "open"
    if "opened_at" not in payload_json:
        payload_json["opened_at"] = datetime.utcnow().isoformat()
    payload_json["updated_at"] = datetime.utcnow().isoformat()
    round_row.scores_json = json.dumps(payload_json)
    round_row.closed = 0

    db.commit()
    db.refresh(round_row)
    db.refresh(booking)
    return {
        "status": "success",
        "round": _serialize_round(booking, round_row),
        "handicap_sa": handicap_result,
    }


def _submit_owned_round(
    db: Session,
    round_row: models.Round,
    booking: models.Booking,
    payload: PlayerRoundSubmitPayload,
    no_return_override: bool = False,
) -> dict:
    mode = _normalize_scoring_mode(payload.scoring_mode)
    no_return = bool(no_return_override or payload.no_return)
    data = _parse_scores_json(getattr(round_row, "scores_json", None))
    data["mode"] = mode
    data["state"] = "submitted"
    data["submitted_at"] = datetime.utcnow().isoformat()
    if payload.holes_played is not None:
        try:
            data["holes_played"] = int(payload.holes_played)
        except Exception:
            data["holes_played"] = payload.holes_played
    if payload.adjusted_gross is not None:
        try:
            data["adjusted_gross"] = int(payload.adjusted_gross)
        except Exception:
            data["adjusted_gross"] = payload.adjusted_gross

    if payload.scores_json is not None:
        text = str(payload.scores_json).strip()
        if text:
            if mode == "hole_by_hole":
                try:
                    data["scores"] = json.loads(text)
                except Exception:
                    data["scores_raw"] = text
            else:
                data["scores_raw"] = text

    if no_return:
        data["no_return"] = True
        data["committee_review_required"] = True
        round_row.handicap_synced = 0
    else:
        if mode == "adjusted_gross" and data.get("adjusted_gross") is None:
            raise HTTPException(status_code=400, detail="adjusted_gross is required for adjusted gross submissions")
        if mode == "hole_by_hole" and data.get("scores") is None and not str(data.get("scores_raw") or "").strip():
            raise HTTPException(status_code=400, detail="scores_json is required for hole-by-hole submissions")

        sync_result = {"success": False, "detail": "Not submitted to Handicap SA"}
        if str(getattr(round_row, "handicap_sa_round_id", "") or "").strip():
            try:
                sync_result = handicap_sa.submit_scores(
                    round_id=str(round_row.handicap_sa_round_id),
                    scores_json=json.dumps(data),
                    player_name=str(getattr(booking, "player_name", "") or ""),
                )
                if bool(sync_result.get("success")):
                    round_row.handicap_synced = 1
            except Exception as exc:
                sync_result = {"success": False, "detail": str(exc)[:200]}
        data["handicap_sync_result"] = sync_result

    round_row.scores_json = json.dumps(data)
    round_row.closed = 1
    if getattr(booking, "status", None) not in {models.BookingStatus.cancelled, models.BookingStatus.no_show}:
        booking.status = models.BookingStatus.completed
    crud.ensure_paid_ledger_entry(db, booking)
    return data


@router.put("/my-rounds/{round_id}/submit")
def submit_my_round(
    round_id: int,
    payload: PlayerRoundSubmitPayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(_require_player),
    club_id: int = Depends(get_active_club_id),
):
    round_row, booking, member = _load_owned_round(db, int(round_id), current_user, club_id)
    _sync_booking_identity(booking, current_user, member)
    data = _submit_owned_round(db, round_row, booking, payload, no_return_override=False)
    db.commit()
    db.refresh(round_row)
    db.refresh(booking)
    return {
        "status": "success",
        "round": _serialize_round(booking, round_row),
        "submission": {
            "mode": data.get("mode"),
            "no_return": bool(data.get("no_return", False)),
            "committee_review_required": bool(data.get("committee_review_required", False)),
        },
    }


@router.post("/my-rounds/{round_id}/no-return")
def mark_no_return(
    round_id: int,
    adjusted_gross: int | None = Query(None, ge=1, le=300),
    holes_played: int | None = Query(None, ge=1, le=36),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(_require_player),
    club_id: int = Depends(get_active_club_id),
):
    round_row, booking, member = _load_owned_round(db, int(round_id), current_user, club_id)
    _sync_booking_identity(booking, current_user, member)
    payload = PlayerRoundSubmitPayload(
        scoring_mode="adjusted_gross",
        adjusted_gross=adjusted_gross,
        holes_played=holes_played,
        no_return=True,
    )
    data = _submit_owned_round(db, round_row, booking, payload, no_return_override=True)
    db.commit()
    db.refresh(round_row)
    db.refresh(booking)
    return {
        "status": "success",
        "round": _serialize_round(booking, round_row),
        "submission": {
            "mode": data.get("mode"),
            "no_return": True,
            "committee_review_required": True,
        },
    }
