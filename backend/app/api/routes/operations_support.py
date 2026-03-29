from __future__ import annotations

import json
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.models import BookingRule, BookingRuleSet, Club, ClubConfig, Course, PricingMatrix, PricingRule, Tee
from app.schemas.operations import BookingRuleSetResponse, PricingMatrixResponse, TeeResponse

DEFAULT_OPERATING_HOURS = {
    "monday": {"open": "06:00", "close": "18:00", "closed": False},
    "tuesday": {"open": "06:00", "close": "18:00", "closed": False},
    "wednesday": {"open": "06:00", "close": "18:00", "closed": False},
    "thursday": {"open": "06:00", "close": "18:00", "closed": False},
    "friday": {"open": "06:00", "close": "18:00", "closed": False},
    "saturday": {"open": "06:00", "close": "18:00", "closed": False},
    "sunday": {"open": "06:00", "close": "18:00", "closed": False},
}


def build_default_operating_hours() -> dict[str, object]:
    return json.loads(json.dumps(DEFAULT_OPERATING_HOURS))


def get_or_create_club_config(db: Session, club_id: uuid.UUID) -> ClubConfig:
    config = db.scalar(select(ClubConfig).where(ClubConfig.club_id == club_id))
    if config is not None:
        return config
    club = db.get(Club, club_id)
    if club is None:
        raise NotFoundError("Club not found")
    config = ClubConfig(
        club_id=club_id,
        timezone=club.timezone,
        operating_hours=build_default_operating_hours(),
        booking_window_days=14,
        cancellation_policy_hours=24,
        default_slot_interval_minutes=10,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def ensure_course_name_available(db: Session, club_id: uuid.UUID, course_name: str) -> None:
    existing = db.scalar(select(Course.id).where(Course.club_id == club_id, Course.name == course_name))
    if existing is not None:
        raise ConflictError("Course name already exists for this club")


def get_course_for_club(db: Session, course_id: uuid.UUID, club_id: uuid.UUID) -> Course:
    course = db.scalar(select(Course).where(Course.id == course_id, Course.club_id == club_id))
    if course is None:
        raise NotFoundError("Course not found")
    return course


def load_rule_set(db: Session, rule_set_id: uuid.UUID, club_id: uuid.UUID) -> BookingRuleSet:
    ruleset = db.scalar(
        select(BookingRuleSet)
        .options(selectinload(BookingRuleSet.rules))
        .where(BookingRuleSet.id == rule_set_id, BookingRuleSet.club_id == club_id)
    )
    if ruleset is None:
        raise NotFoundError("Booking rule set not found")
    return ruleset


def load_pricing_matrix(db: Session, matrix_id: uuid.UUID, club_id: uuid.UUID) -> PricingMatrix:
    matrix = db.scalar(
        select(PricingMatrix)
        .options(selectinload(PricingMatrix.rules))
        .where(PricingMatrix.id == matrix_id, PricingMatrix.club_id == club_id)
    )
    if matrix is None:
        raise NotFoundError("Pricing matrix not found")
    return matrix


def replace_booking_rules(db: Session, ruleset: BookingRuleSet, payload_rules) -> None:
    for existing in list(ruleset.rules):
        db.delete(existing)
    db.flush()
    for index, item in enumerate(payload_rules):
        db.add(
            BookingRule(
                ruleset_id=ruleset.id,
                type=item.type,
                evaluation_order=item.evaluation_order if item.evaluation_order is not None else index,
                config=dict(item.config),
                active=item.active,
            )
        )
    db.flush()


def replace_pricing_rules(db: Session, matrix: PricingMatrix, payload_rules) -> None:
    for existing in list(matrix.rules):
        db.delete(existing)
    db.flush()
    for item in payload_rules:
        db.add(
            PricingRule(
                matrix_id=matrix.id,
                applies_to=item.applies_to,
                day_type=item.day_type,
                time_band=item.time_band,
                time_band_ref=item.time_band_ref,
                price=item.price,
                currency=item.currency,
                active=item.active,
            )
        )
    db.flush()


def to_tee_response(tee: Tee) -> TeeResponse:
    return TeeResponse(
        id=tee.id,
        course_id=tee.course_id,
        course_name=tee.course.name,
        name=tee.name,
        gender=tee.gender,
        slope_rating=tee.slope_rating,
        course_rating=tee.course_rating,
        color_code=tee.color_code,
        active=tee.active,
        created_at=tee.created_at,
        updated_at=tee.updated_at,
    )


def to_rule_set_response(ruleset: BookingRuleSet) -> BookingRuleSetResponse:
    return BookingRuleSetResponse.model_validate(ruleset)


def to_pricing_matrix_response(matrix: PricingMatrix) -> PricingMatrixResponse:
    return PricingMatrixResponse.model_validate(matrix)
