"""TeeSheetLockService — Phase 10 / Slice 8.5 optimistic-lock primitive.

Slot-level advisory locks for tee-sheet UI coordination. Acquire is
optimistic: the unique constraint on (course_id, slot_datetime)
serializes concurrent INSERTs. The first wins; the second catches
IntegrityError and returns a conflict struct.

Locks are NOT consulted by booking endpoints — the booking layer's own
capacity check remains the source of truth for placement. Locks are a
UI signal that another operator is editing the slot.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.datetime import utc_now
from app.core.exceptions import ConflictError
from app.events.emission_context import EmissionContext
from app.events.publisher import DatabaseEventPublisher
from app.models import ClubConfig, TeeSheetLock

LOCK_TTL_SECONDS = 60


@dataclass(slots=True)
class TeeSheetLockConflict:
    """Result variant when acquire conflicts with an existing active lock."""

    existing_lock: TeeSheetLock


class TeeSheetLockService:
    TTL_SECONDS = LOCK_TTL_SECONDS

    def __init__(self, db: Session) -> None:
        self.db = db
        self.publisher = DatabaseEventPublisher(db)

    # ------------------------------------------------------------------
    # Mutations
    # ------------------------------------------------------------------

    def acquire(
        self,
        *,
        club_id: uuid.UUID,
        course_id: uuid.UUID,
        slot_datetime: datetime,
        holder_user_id: uuid.UUID,
        context: EmissionContext | None = None,
    ) -> TeeSheetLock | TeeSheetLockConflict:
        """Acquire a lock on (course_id, slot_datetime).

        Returns:
            - ``TeeSheetLock`` on success (201 path on the route).
            - ``TeeSheetLockConflict`` carrying the existing active lock
              when one is already held by another operator (409 path).

        Expired-lock handling (Approach A per spec): if an expired lock
        exists for the target slot, it is deleted before the new acquire
        and a ``tee_sheet_lock.released`` event is emitted for the
        expired row's holder. This keeps the audit trail clean — the
        expired lock's release is its own event distinct from the new
        acquire.
        """

        now = utc_now()
        existing = self._load_lock_for_slot(
            club_id=club_id, course_id=course_id, slot_datetime=slot_datetime
        )
        if existing is not None and existing.expires_at <= now:
            # Approach A — delete the expired lock and emit its release.
            previous_holder_user_id = existing.holder_user_id
            previous_lock_id = existing.id
            self.db.delete(existing)
            self.db.flush()
            self.publisher.publish(
                event_type="tee_sheet_lock.released",
                aggregate_type="tee_sheet_lock",
                aggregate_id=str(previous_lock_id),
                payload={
                    "lock_id": str(previous_lock_id),
                    "previous_holder_user_id": str(previous_holder_user_id),
                    "reason": "expired",
                },
                context=context,
                club_id=club_id,
            )
            existing = None

        if existing is not None:
            return TeeSheetLockConflict(existing_lock=existing)

        lock = TeeSheetLock(
            club_id=club_id,
            course_id=course_id,
            slot_datetime=slot_datetime,
            holder_user_id=holder_user_id,
            expires_at=now + timedelta(seconds=self.TTL_SECONDS),
        )
        self.db.add(lock)
        try:
            self.db.flush()
        except IntegrityError as exc:
            # Concurrent acquire raced us through the existence check.
            # Roll back this attempt and re-read the now-existing row.
            self.db.rollback()
            winner = self._load_lock_for_slot(
                club_id=club_id, course_id=course_id, slot_datetime=slot_datetime
            )
            if winner is None:
                # The conflicting row vanished between rollback and re-read
                # (unlikely outside test races). Surface as a ConflictError
                # to keep the contract honest.
                raise ConflictError(
                    "Tee sheet lock acquire failed and the conflicting row could not be re-read",
                    code="tee_sheet_lock_acquire_race",
                ) from exc
            return TeeSheetLockConflict(existing_lock=winner)

        self.publisher.publish(
            event_type="tee_sheet_lock.acquired",
            aggregate_type="tee_sheet_lock",
            aggregate_id=str(lock.id),
            payload={
                "lock_id": str(lock.id),
                "course_id": str(course_id),
                "slot_datetime": slot_datetime.isoformat(),
                "holder_user_id": str(holder_user_id),
                "expires_at": lock.expires_at.isoformat(),
            },
            context=context,
            club_id=club_id,
        )
        return lock

    def renew(
        self,
        *,
        club_id: uuid.UUID,
        lock_id: uuid.UUID,
        holder_user_id: uuid.UUID,
        context: EmissionContext | None = None,
    ) -> TeeSheetLock:
        """Renew the holder's lock — resets TTL to a fresh 60 seconds.

        Raises:
            ConflictError(``tee_sheet_lock_not_found_or_expired``) if the
                lock doesn't exist or has already expired.
            ConflictError(``tee_sheet_lock_not_held_by_caller``) if the
                caller's user_id does not match holder_user_id.
        """

        lock = self.db.get(TeeSheetLock, lock_id)
        now = utc_now()
        if lock is None or lock.club_id != club_id or lock.expires_at <= now:
            raise ConflictError(
                "Tee sheet lock not found or expired",
                code="tee_sheet_lock_not_found_or_expired",
            )
        if lock.holder_user_id != holder_user_id:
            raise ConflictError(
                "Tee sheet lock is held by another operator",
                code="tee_sheet_lock_not_held_by_caller",
            )

        lock.expires_at = now + timedelta(seconds=self.TTL_SECONDS)
        self.db.add(lock)
        self.db.flush()
        self.publisher.publish(
            event_type="tee_sheet_lock.renewed",
            aggregate_type="tee_sheet_lock",
            aggregate_id=str(lock.id),
            payload={
                "lock_id": str(lock.id),
                "expires_at": lock.expires_at.isoformat(),
            },
            context=context,
            club_id=club_id,
        )
        return lock

    def release(
        self,
        *,
        club_id: uuid.UUID,
        lock_id: uuid.UUID,
        holder_user_id: uuid.UUID,
        context: EmissionContext | None = None,
    ) -> None:
        """Release the holder's lock. Idempotent: releasing a missing
        lock is a no-op (it may have already expired or been released).

        Raises:
            ConflictError(``tee_sheet_lock_not_held_by_caller``) if the
                lock exists but the caller does not hold it.
        """

        lock = self.db.get(TeeSheetLock, lock_id)
        if lock is None or lock.club_id != club_id:
            # Already released, expired-and-cleaned, or never existed.
            return
        if lock.holder_user_id != holder_user_id:
            raise ConflictError(
                "Tee sheet lock is held by another operator",
                code="tee_sheet_lock_not_held_by_caller",
            )

        previous_lock_id = lock.id
        previous_holder_user_id = lock.holder_user_id
        self.db.delete(lock)
        self.db.flush()
        self.publisher.publish(
            event_type="tee_sheet_lock.released",
            aggregate_type="tee_sheet_lock",
            aggregate_id=str(previous_lock_id),
            payload={
                "lock_id": str(previous_lock_id),
                "previous_holder_user_id": str(previous_holder_user_id),
                "reason": "released",
            },
            context=context,
            club_id=club_id,
        )

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    def list_active(
        self,
        *,
        club_id: uuid.UUID,
        course_id: uuid.UUID,
        day: date,
    ) -> list[TeeSheetLock]:
        """Return active (non-expired) locks for a course on a date.

        ``day`` is the local calendar date in the club's timezone (the
        same idiom the tee-sheet day endpoint uses). The day-range
        bounds are computed from the club config; if no config row
        exists the day is treated as a UTC window (safe default — the
        only consumers in v1 are clubs with an active ClubConfig row).
        """

        zone = self._club_timezone(club_id)
        day_start = datetime.combine(day, time.min, tzinfo=zone)
        day_end = datetime.combine(day, time.max, tzinfo=zone)
        now = utc_now()
        stmt = (
            select(TeeSheetLock)
            .where(
                TeeSheetLock.club_id == club_id,
                TeeSheetLock.course_id == course_id,
                TeeSheetLock.slot_datetime >= day_start,
                TeeSheetLock.slot_datetime <= day_end,
                TeeSheetLock.expires_at > now,
            )
            .order_by(TeeSheetLock.slot_datetime.asc())
        )
        return list(self.db.scalars(stmt).all())

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _load_lock_for_slot(
        self,
        *,
        club_id: uuid.UUID,
        course_id: uuid.UUID,
        slot_datetime: datetime,
    ) -> TeeSheetLock | None:
        return self.db.scalar(
            select(TeeSheetLock).where(
                TeeSheetLock.club_id == club_id,
                TeeSheetLock.course_id == course_id,
                TeeSheetLock.slot_datetime == slot_datetime,
            )
        )

    def _club_timezone(self, club_id: uuid.UUID) -> ZoneInfo:
        club_config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == club_id))
        if club_config is None:
            return ZoneInfo("UTC")
        return ZoneInfo(club_config.timezone)
