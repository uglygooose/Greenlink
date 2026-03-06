from __future__ import annotations

from app import models


def _role_value(raw) -> str:
    return str(getattr(raw, "value", raw) or "").strip().lower()


def sync_user_club_assignment(
    db,
    user: models.User,
    *,
    club_id: int | None = None,
    role = None,
    is_primary: bool | None = True,
):
    if user is None or not getattr(user, "id", None):
        return None

    resolved_role = _role_value(role if role is not None else getattr(user, "role", None))
    if resolved_role == models.UserRole.super_admin.value:
        return None

    try:
        resolved_club_id = int(club_id if club_id is not None else getattr(user, "club_id", None) or 0)
    except Exception:
        resolved_club_id = 0
    if resolved_club_id <= 0:
        return None

    assignment = (
        db.query(models.UserClubAssignment)
        .filter(
            models.UserClubAssignment.user_id == int(user.id),
            models.UserClubAssignment.club_id == int(resolved_club_id),
        )
        .first()
    )
    if not assignment:
        assignment = models.UserClubAssignment(
            user_id=int(user.id),
            club_id=int(resolved_club_id),
            role=resolved_role or models.UserRole.player.value,
            is_primary=bool(is_primary),
        )
        db.add(assignment)
        db.flush()
    else:
        assignment.role = resolved_role or assignment.role or models.UserRole.player.value
        if is_primary is not None:
            assignment.is_primary = bool(is_primary)

    if is_primary:
        (
            db.query(models.UserClubAssignment)
            .filter(
                models.UserClubAssignment.user_id == int(user.id),
                models.UserClubAssignment.club_id != int(resolved_club_id),
                models.UserClubAssignment.is_primary.is_(True),
            )
            .update({models.UserClubAssignment.is_primary: False}, synchronize_session=False)
        )
        assignment.is_primary = True

    if getattr(user, "club_id", None) != int(resolved_club_id):
        user.club_id = int(resolved_club_id)

    return assignment


def list_user_club_ids(db, user: models.User) -> list[int]:
    if user is None or not getattr(user, "id", None):
        return []
    rows = (
        db.query(models.UserClubAssignment.club_id)
        .filter(models.UserClubAssignment.user_id == int(user.id))
        .order_by(models.UserClubAssignment.is_primary.desc(), models.UserClubAssignment.club_id.asc())
        .all()
    )
    club_ids = [int(club_id) for (club_id,) in rows if club_id is not None]
    if club_ids:
        return club_ids

    try:
        resolved = int(getattr(user, "club_id", None) or 0)
    except Exception:
        resolved = 0
    return [resolved] if resolved > 0 else []


def ensure_user_primary_club(db, user: models.User, *, sync_user_record: bool = True) -> int | None:
    if user is None:
        return None

    if _role_value(getattr(user, "role", None)) == models.UserRole.super_admin.value:
        if sync_user_record and getattr(user, "club_id", None) is not None:
            user.club_id = None
        return None

    club_ids = list_user_club_ids(db, user)
    primary_id = club_ids[0] if club_ids else None

    try:
        existing = int(getattr(user, "club_id", None) or 0)
    except Exception:
        existing = 0

    resolved = existing if existing > 0 else primary_id
    if sync_user_record and resolved and existing != resolved:
        user.club_id = int(resolved)
    return int(resolved) if resolved else None
