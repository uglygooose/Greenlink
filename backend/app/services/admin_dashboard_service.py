from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Booking,
    BookingPaymentStatus,
    BookingStatus,
    ClubConfig,
    ClubMembership,
    ClubMembershipStatus,
    ClubTarget,
    Course,
    FinanceTransaction,
    Tee,
)
from app.schemas.admin_dashboard import (
    AdminDashboardSummaryResponse,
    DashboardActivityItem,
    DashboardNotice,
    DashboardTargetContext,
    DashboardTeeOccupancy,
)
from app.services.booking_state_service import LIVE_OCCUPANCY_STATUSES
from app.services.targets_service import TARGET_DOMAIN_REGISTRY


def _slot_time_count(
    today: date,
    zone: ZoneInfo,
    operating_hours: dict[str, object],
    interval_minutes: int,
) -> int:
    """Return the number of tee-sheet slot times for today given club operating hours."""
    day_name = today.strftime("%A").lower()
    day_hours = operating_hours.get(day_name)
    if not isinstance(day_hours, dict) or day_hours.get("closed"):
        return 0
    open_str = day_hours.get("open")
    close_str = day_hours.get("close")
    if not isinstance(open_str, str) or not isinstance(close_str, str):
        return 0
    if ":" not in open_str or ":" not in close_str:
        return 0
    oh, om = open_str.split(":", 1)
    ch, cm = close_str.split(":", 1)
    if not (oh.isdigit() and om.isdigit() and ch.isdigit() and cm.isdigit()):
        return 0
    open_time = time(hour=int(oh), minute=int(om))
    close_time = time(hour=int(ch), minute=int(cm))
    if open_time >= close_time:
        return 0
    open_dt = datetime.combine(today, open_time, tzinfo=zone)
    close_dt = datetime.combine(today, close_time, tzinfo=zone)
    span_minutes = int((close_dt - open_dt).total_seconds() / 60)
    return span_minutes // interval_minutes


class AdminDashboardService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_summary(self, *, club_id: uuid.UUID) -> AdminDashboardSummaryResponse:
        member_count = self._get_member_count(club_id)
        tee_occupancy, tee_warnings = self._get_tee_occupancy(club_id)
        recent_activity = self._get_recent_activity(club_id)
        active_targets = self._get_active_targets(club_id)
        unpaid_bookings_today = self._get_unpaid_bookings_today(club_id)
        no_show_risk_count = self._get_no_show_risk_count(club_id)
        arrivals_due_count = self._get_arrivals_due_count(club_id)
        close_day_ready = unpaid_bookings_today == 0 and no_show_risk_count == 0
        return AdminDashboardSummaryResponse(
            member_count=member_count,
            tee_occupancy=tee_occupancy,
            tee_warnings=tee_warnings,
            recent_activity=recent_activity,
            active_targets=active_targets,
            unpaid_bookings_today=unpaid_bookings_today,
            no_show_risk_count=no_show_risk_count,
            arrivals_due_count=arrivals_due_count,
            close_day_ready=close_day_ready,
        )

    def _get_member_count(self, club_id: uuid.UUID) -> int:
        count = self.db.scalar(
            select(func.count())
            .select_from(ClubMembership)
            .where(
                ClubMembership.club_id == club_id,
                ClubMembership.status == ClubMembershipStatus.ACTIVE,
            )
        )
        return count or 0

    def _get_tee_occupancy(
        self, club_id: uuid.UUID
    ) -> tuple[DashboardTeeOccupancy, list[DashboardNotice]]:
        warnings: list[DashboardNotice] = []

        club_config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == club_id))
        if club_config is None:
            return DashboardTeeOccupancy(
                booked_slots=0, total_slots=0, occupancy_pct=None
            ), warnings

        zone = ZoneInfo(club_config.timezone)
        today = datetime.now(zone).date()

        course_count: int = (
            self.db.scalar(
                select(func.count()).select_from(Course).where(Course.club_id == club_id)
            )
            or 0
        )

        if course_count == 0:
            warnings.append(
                DashboardNotice(
                    code="no_courses_configured",
                    message=(
                        "No courses are configured for this club. "
                        "Set up a course to enable tee sheet bookings."
                    ),
                )
            )
            return DashboardTeeOccupancy(
                booked_slots=0, total_slots=0, occupancy_pct=None
            ), warnings

        slot_times = _slot_time_count(
            today,
            zone,
            club_config.operating_hours,
            club_config.default_slot_interval_minutes,
        )

        if slot_times == 0:
            day_name = today.strftime("%A")
            warnings.append(
                DashboardNotice(
                    code="tee_sheet_closed_today",
                    message=(
                        f"The tee sheet is closed today ({day_name}). "
                        "Check operating hours in club settings."
                    ),
                )
            )
            return DashboardTeeOccupancy(
                booked_slots=0, total_slots=0, occupancy_pct=None
            ), warnings

        # Count active tees across all courses for this club.
        # Each tee appears once per start lane (Hole 1 + Hole 10 = 2 lanes).
        # Clubs with no configured tees fall back to course-sheet mode (1 row × 2 lanes per course).
        active_tee_count: int = (
            self.db.scalar(
                select(func.count())
                .select_from(Tee)
                .join(Course, Course.id == Tee.course_id)
                .where(Course.club_id == club_id, Tee.active.is_(True))
            )
            or 0
        )

        row_count = (active_tee_count * 2) if active_tee_count > 0 else (max(1, course_count) * 2)
        total_slots = slot_times * row_count

        # Today's UTC window derived from the club's local date.
        today_start_utc = datetime.combine(today, time.min, tzinfo=zone).astimezone(UTC)
        today_end_utc = datetime.combine(
            today + timedelta(days=1), time.min, tzinfo=zone
        ).astimezone(UTC)

        booked_slots: int = (
            self.db.scalar(
                select(func.count())
                .select_from(Booking)
                .where(
                    Booking.club_id == club_id,
                    Booking.slot_datetime >= today_start_utc,
                    Booking.slot_datetime < today_end_utc,
                    Booking.status.in_(tuple(LIVE_OCCUPANCY_STATUSES)),
                )
            )
            or 0
        )

        occupancy_pct = round(booked_slots / total_slots * 100) if total_slots > 0 else None
        return (
            DashboardTeeOccupancy(
                booked_slots=booked_slots,
                total_slots=total_slots,
                occupancy_pct=occupancy_pct,
            ),
            warnings,
        )

    def _get_recent_activity(self, club_id: uuid.UUID) -> list[DashboardActivityItem]:
        transactions = list(
            self.db.scalars(
                select(FinanceTransaction)
                .where(FinanceTransaction.club_id == club_id)
                .order_by(
                    FinanceTransaction.created_at.desc(),
                    FinanceTransaction.id.desc(),
                )
                .limit(6)
            ).all()
        )
        return [
            DashboardActivityItem(
                id=tx.id,
                description=tx.description,
                source=tx.source.value,
                type=tx.type.value,
                amount=str(abs(tx.amount)),
                created_at=tx.created_at,
            )
            for tx in transactions
        ]

    def _get_active_targets(self, club_id: uuid.UUID) -> list[DashboardTargetContext]:
        """Return targets whose period spans today, for display alongside dashboard KPIs."""
        today = datetime.now(UTC).date()
        rows = list(
            self.db.scalars(
                select(ClubTarget).where(
                    ClubTarget.club_id == club_id,
                    ClubTarget.archived_at.is_(None),
                    ClubTarget.period_start <= today,
                    ClubTarget.period_end >= today,
                )
            ).all()
        )
        result: list[DashboardTargetContext] = []
        for row in rows:
            domain = next((d for d in TARGET_DOMAIN_REGISTRY if d.key == row.domain_key), None)
            if domain is None:
                continue
            metric = next((m for m in domain.metrics if m.key == row.metric_key), None)
            if metric is None:
                continue
            result.append(
                DashboardTargetContext(
                    domain_key=row.domain_key,
                    domain_label=domain.label,
                    metric_key=row.metric_key,
                    metric_label=metric.label,
                    period_key=row.period_key,
                    period_start=row.period_start,
                    period_end=row.period_end,
                    target_value=float(row.target_value),
                    unit=metric.unit,
                )
            )
        return result

    def _get_unpaid_bookings_today(self, club_id: uuid.UUID) -> int:
        """Count of today's reserved or checked-in bookings with payment_status=pending."""
        club_config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == club_id))
        if club_config is None:
            return 0
        zone = ZoneInfo(club_config.timezone)
        today = datetime.now(zone).date()
        today_start_utc = datetime.combine(today, time.min, tzinfo=zone).astimezone(UTC)
        today_end_utc = datetime.combine(
            today + timedelta(days=1), time.min, tzinfo=zone
        ).astimezone(UTC)
        count = self.db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.club_id == club_id,
                Booking.slot_datetime >= today_start_utc,
                Booking.slot_datetime < today_end_utc,
                Booking.payment_status == BookingPaymentStatus.PENDING,
                Booking.status.in_((BookingStatus.RESERVED, BookingStatus.CHECKED_IN)),
            )
        )
        return count or 0

    def _get_no_show_risk_count(self, club_id: uuid.UUID) -> int:
        """Count of today's reserved bookings whose start time has already passed."""
        club_config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == club_id))
        if club_config is None:
            return 0
        zone = ZoneInfo(club_config.timezone)
        today = datetime.now(zone).date()
        today_start_utc = datetime.combine(today, time.min, tzinfo=zone).astimezone(UTC)
        today_end_utc = datetime.combine(
            today + timedelta(days=1), time.min, tzinfo=zone
        ).astimezone(UTC)
        now_utc = datetime.now(UTC)
        count = self.db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.club_id == club_id,
                Booking.status == BookingStatus.RESERVED,
                Booking.slot_datetime >= today_start_utc,
                Booking.slot_datetime < today_end_utc,
                Booking.slot_datetime < now_utc,
            )
        )
        return count or 0

    def _get_arrivals_due_count(self, club_id: uuid.UUID) -> int:
        """Count of today's reserved bookings due within the next 90 minutes."""
        club_config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == club_id))
        if club_config is None:
            return 0
        zone = ZoneInfo(club_config.timezone)
        today = datetime.now(zone).date()
        today_start_utc = datetime.combine(today, time.min, tzinfo=zone).astimezone(UTC)
        today_end_utc = datetime.combine(
            today + timedelta(days=1), time.min, tzinfo=zone
        ).astimezone(UTC)
        now_utc = datetime.now(UTC)
        window_end_utc = now_utc + timedelta(minutes=90)
        count = self.db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.club_id == club_id,
                Booking.status == BookingStatus.RESERVED,
                Booking.slot_datetime >= today_start_utc,
                Booking.slot_datetime < today_end_utc,
                Booking.slot_datetime >= now_utc,
                Booking.slot_datetime <= window_end_utc,
            )
        )
        return count or 0
