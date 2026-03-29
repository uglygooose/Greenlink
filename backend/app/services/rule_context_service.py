from __future__ import annotations

import uuid
from datetime import timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import AppError, NotFoundError
from app.models import Club, ClubConfig, Course, PricingDayType, PricingTimeBand, Tee
from app.schemas.rule_context import (
    ContextNotice,
    DayTypeResolution,
    NormalizedRuleContext,
    NormalizedScopeContext,
    RuleContextInput,
    TimeBandResolution,
)

WEEKDAY_NAMES = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)


class RuleContextService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def normalize_context(self, raw: RuleContextInput) -> NormalizedRuleContext:
        club = self.db.get(Club, raw.club_id)
        if club is None:
            raise NotFoundError("Club not found")

        club_config = self.db.scalar(select(ClubConfig).where(ClubConfig.club_id == raw.club_id))
        canonical_timezone = club_config.timezone if club_config is not None else club.timezone
        timezone_name = self._resolve_timezone_name(raw.timezone, canonical_timezone)
        zone = self._load_timezone(timezone_name)

        warnings: list[ContextNotice] = []
        if club_config is None:
            warnings.append(
                ContextNotice(
                    code="club_config_timezone_fallback",
                    message="Club config is missing; timezone fallback used the club record",
                )
            )

        course = self._load_course(raw.course_id, raw.club_id) if raw.course_id else None
        tee = self._load_tee(raw.tee_id, raw.club_id) if raw.tee_id else None
        if course is not None and tee is not None and tee.course_id != course.id:
            raise AppError(
                code="invalid_context",
                message="tee_id must belong to the supplied course_id",
                status_code=422,
            )
        if tee is not None and course is None:
            course = tee.course

        effective_datetime = (
            raw.effective_datetime.astimezone(timezone.utc) if raw.effective_datetime is not None else None
        )
        reference_datetime = (
            raw.reference_datetime.astimezone(timezone.utc) if raw.reference_datetime is not None else None
        )
        local_effective = effective_datetime.astimezone(zone) if effective_datetime is not None else None
        local_reference = reference_datetime.astimezone(zone) if reference_datetime is not None else None

        day_type_resolution = self._resolve_day_type(raw.day_type, local_effective)
        time_band_resolution = self._resolve_time_band(raw.time_band, raw.time_band_ref, local_effective)
        warnings.extend(day_type_resolution.warnings)
        warnings.extend(time_band_resolution.warnings)

        return NormalizedRuleContext(
            club_id=raw.club_id,
            course_id=course.id if course is not None else None,
            tee_id=tee.id if tee is not None else None,
            applies_to=raw.applies_to,
            membership_role=raw.membership_role,
            effective_datetime=effective_datetime,
            reference_datetime=reference_datetime,
            timezone=timezone_name,
            local_date=local_effective.date() if local_effective is not None else None,
            local_time=local_effective.timetz().replace(tzinfo=None) if local_effective is not None else None,
            local_day_name=WEEKDAY_NAMES[local_effective.weekday()] if local_effective is not None else None,
            reference_local_date=local_reference.date() if local_reference is not None else None,
            reference_local_time=(
                local_reference.timetz().replace(tzinfo=None) if local_reference is not None else None
            ),
            day_type=day_type_resolution.value,
            time_band=time_band_resolution.value,
            time_band_ref=time_band_resolution.time_band_ref,
            day_type_resolution=day_type_resolution,
            time_band_resolution=time_band_resolution,
            scope_context=NormalizedScopeContext(
                club_ref=str(raw.club_id),
                course_ref=str(course.id) if course is not None else None,
                tee_ref=str(tee.id) if tee is not None else None,
                applies_to_bucket_ref=raw.applies_to.value if raw.applies_to is not None else None,
                membership_role_ref=raw.membership_role.value if raw.membership_role is not None else None,
            ),
            warnings=warnings,
            unsupported=[],
        )

    def _resolve_timezone_name(self, provided_timezone: str | None, canonical_timezone: str) -> str:
        if provided_timezone is None:
            return canonical_timezone
        if provided_timezone != canonical_timezone:
            raise AppError(
                code="invalid_context",
                message="timezone must match the club timezone for rule evaluation",
                status_code=422,
            )
        return canonical_timezone

    def _load_timezone(self, timezone_name: str) -> ZoneInfo:
        try:
            return ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError as exc:
            raise AppError(
                code="invalid_context",
                message=f"Unknown timezone '{timezone_name}'",
                status_code=422,
            ) from exc

    def _load_course(self, course_id: uuid.UUID, club_id: uuid.UUID) -> Course:
        course = self.db.scalar(select(Course).where(Course.id == course_id, Course.club_id == club_id))
        if course is None:
            raise NotFoundError("Course not found")
        return course

    def _load_tee(self, tee_id: uuid.UUID, club_id: uuid.UUID) -> Tee:
        tee = self.db.scalar(
            select(Tee).options(selectinload(Tee.course)).where(Tee.id == tee_id)
        )
        if tee is None or tee.course.club_id != club_id:
            raise NotFoundError("Tee not found")
        return tee

    def _resolve_day_type(
        self,
        supplied_day_type: PricingDayType | None,
        local_effective,
    ) -> DayTypeResolution:
        if supplied_day_type is not None:
            return DayTypeResolution(
                value=supplied_day_type,
                source="supplied",
                holiday_strategy="supplied_override",
                holiday_provider=None,
                warnings=[],
            )
        if local_effective is None:
            return DayTypeResolution(
                value=None,
                source="unresolved",
                holiday_strategy="holiday_provider_required",
                holiday_provider=None,
                warnings=[],
            )
        fallback_value = (
            PricingDayType.WEEKEND if local_effective.weekday() >= 5 else PricingDayType.WEEKDAY
        )
        return DayTypeResolution(
            value=fallback_value,
            source="derived_weekday_weekend",
            holiday_strategy="weekday_weekend_fallback_without_holiday_provider",
            holiday_provider=None,
            warnings=[
                ContextNotice(
                    code="public_holiday_unresolved",
                    message="Day type fell back to weekday/weekend because no holiday provider is configured",
                )
            ],
        )

    def _resolve_time_band(
        self,
        supplied_time_band: PricingTimeBand | None,
        supplied_time_band_ref: str | None,
        local_effective,
    ) -> TimeBandResolution:
        if supplied_time_band is not None:
            contract = "custom_ref_required" if supplied_time_band == PricingTimeBand.CUSTOM else "supplied"
            return TimeBandResolution(
                value=supplied_time_band,
                source="supplied",
                contract=contract,
                time_band_ref=supplied_time_band_ref,
                warnings=[],
            )
        if local_effective is None:
            return TimeBandResolution(
                value=None,
                source="unresolved",
                contract="input_required",
                time_band_ref=None,
                warnings=[],
            )
        derived_time_band = (
            PricingTimeBand.MORNING if local_effective.hour < 12 else PricingTimeBand.AFTERNOON
        )
        return TimeBandResolution(
            value=derived_time_band,
            source="derived_default_split",
            contract="default_split",
            time_band_ref=None,
            warnings=[],
        )
