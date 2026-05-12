"""Audit-log coverage matrix (golf settings).

One test per registered emission across the booking lifecycle, finance, and settings services. Each test invokes the
service method directly with minimal fixtures, then asserts the matching
DomainEventRecord row exists via the conftest helper.

Snapshot assertions check structural presence (the right keys), not value
equality — value comparison is brittle and a separate concern.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.events.emission_context import EmissionContext
from app.models import (
    AccountCustomer,
    Booking,
    BookingPaymentStatus,
    BookingRule,
    BookingRuleAppliesTo,
    BookingRuleConflictStrategy,
    BookingRuleScopeType,
    BookingRuleSet,
    BookingRuleType,
    BookingSource,
    BookingStatus,
    Club,
    ClubConfig,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    FinanceAccount,
    FinanceAccountStatus,
    Person,
    PricingDayType,
    PricingMatrix,
    PricingPlayerType,
    PricingRule,
    PricingRuleAppliesTo,
    PricingSeason,
    PricingTimeBand,
    Tee,
    User,
)
from app.services.golf_settings_service import GolfSettingsService
from tests.conftest import assert_event_emitted

# ---------- Shared seed helpers ------------------------------------------


def _create_user(db: Session, *, email: str) -> User:
    local_part = email.split("@")[0]
    person = Person(
        first_name=local_part.title(),
        last_name="User",
        full_name=build_full_name(local_part.title(), "User"),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.flush()
    user = User(
        email=email,
        password_hash=hash_password("password123"),
        display_name=local_part,
        person_id=person.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_person(db: Session, *, email: str = "p@example.com") -> Person:
    person = Person(
        first_name="P",
        last_name="Member",
        full_name="P Member",
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


def _create_club(db: Session, *, slug: str) -> Club:
    club = Club(name=f"Club {slug}", slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _assign_membership(
    db: Session,
    *,
    person_id: uuid.UUID,
    club_id: uuid.UUID,
    role: ClubMembershipRole = ClubMembershipRole.MEMBER,
) -> ClubMembership:
    membership = ClubMembership(
        person_id=person_id,
        club_id=club_id,
        role=role,
        status=ClubMembershipStatus.ACTIVE,
        is_primary=True,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def _seed_course(db: Session, *, club: Club) -> tuple[Course, Tee]:
    course = Course(club_id=club.id, name="Main", holes=18, active=True)
    db.add(course)
    db.flush()
    tee = Tee(
        course_id=course.id,
        name="Blue",
        slope_rating=128,
        course_rating="72.4",
        color_code="#1b4d8f",
        active=True,
    )
    db.add(tee)
    db.commit()
    db.refresh(course)
    db.refresh(tee)
    return course, tee


def _seed_booking(
    db: Session,
    *,
    club: Club,
    course: Course,
    person: Person,
    status: BookingStatus = BookingStatus.RESERVED,
    slot_datetime: datetime | None = None,
    payment_status: BookingPaymentStatus | None = None,
) -> Booking:
    slot_datetime = slot_datetime or datetime(2026, 6, 1, 7, 0, tzinfo=UTC)
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        slot_datetime=slot_datetime,
        slot_interval_minutes=10,
        holes=18,
        status=status,
        source=BookingSource.ADMIN,
        party_size=1,
        primary_person_id=person.id,
        cart_flag=False,
        caddie_flag=False,
        payment_status=payment_status,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def _seed_club_config(db: Session, *, club: Club) -> ClubConfig:
    config = ClubConfig(
        club_id=club.id,
        timezone="Africa/Johannesburg",
        operating_hours={
            day: {"open": "06:00", "close": "18:00", "closed": False}
            for day in (
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
                "sunday",
            )
        },
        booking_window_days=14,
        cancellation_policy_hours=24,
        default_slot_interval_minutes=10,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def _seed_finance_account(
    db: Session, *, club: Club, person: Person
) -> tuple[AccountCustomer, FinanceAccount]:
    account_customer = AccountCustomer(
        club_id=club.id,
        person_id=person.id,
        account_code=f"AC-{uuid.uuid4().hex[:8]}",
        active=True,
        billing_metadata={},
    )
    db.add(account_customer)
    db.flush()
    account = FinanceAccount(
        club_id=club.id,
        account_customer_id=account_customer.id,
        status=FinanceAccountStatus.ACTIVE,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account_customer, account


# ---------- Golf settings ------------------------------------------------


def _seed_published_rule_set(db: Session, *, club: Club) -> BookingRuleSet:
    ruleset = BookingRuleSet(
        club_id=club.id,
        name="v1",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        conflict_strategy=BookingRuleConflictStrategy.MERGE,
        priority=100,
        active=False,
    )
    db.add(ruleset)
    db.flush()
    db.add(
        BookingRule(
            ruleset_id=ruleset.id,
            type=BookingRuleType.ADVANCE_WINDOW,
            evaluation_order=0,
            config={"days": 14},
            active=True,
        )
    )
    db.commit()
    db.refresh(ruleset)
    return ruleset


def _seed_pricing_matrix(db: Session, *, club: Club) -> PricingMatrix:
    matrix = PricingMatrix(club_id=club.id, name="v1", active=False)
    db.add(matrix)
    db.flush()
    db.add(
        PricingRule(
            matrix_id=matrix.id,
            applies_to=PricingRuleAppliesTo.MEMBER,
            player_type=PricingPlayerType.MEMBER_STANDARD,
            holes=18,
            day_type=PricingDayType.ANY,
            season=PricingSeason.ANY,
            time_band=PricingTimeBand.ANY,
            price="325.00",
            currency="ZAR",
            active=True,
        )
    )
    db.commit()
    db.refresh(matrix)
    return matrix


def test_settings_rule_set_published_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="gs-rp@example.com")
    club = _create_club(db_session, slug="gs-rp")
    course, _ = _seed_course(db_session, club=club)
    _ = course  # Course + Tee are prerequisite for publish_rule_set
    ruleset = _seed_published_rule_set(db_session, club=club)
    GolfSettingsService(db_session).publish_rule_set(
        club.id, ruleset.id, context=EmissionContext(actor_user_id=user.id)
    )
    assert_event_emitted(
        db_session,
        entity_type="rule_set",
        entity_id=str(ruleset.id),
        action="settings.rule_set.published",
    )


def test_settings_rule_set_rolled_back_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="gs-rr@example.com")
    club = _create_club(db_session, slug="gs-rr")
    _seed_course(db_session, club=club)
    first = _seed_published_rule_set(db_session, club=club)
    second = BookingRuleSet(
        club_id=club.id,
        name="v2",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        conflict_strategy=BookingRuleConflictStrategy.MERGE,
        priority=100,
        active=False,
    )
    db_session.add(second)
    db_session.flush()
    db_session.add(
        BookingRule(
            ruleset_id=second.id,
            type=BookingRuleType.ADVANCE_WINDOW,
            evaluation_order=0,
            config={"days": 14},
            active=True,
        )
    )
    db_session.commit()
    service = GolfSettingsService(db_session)
    service.publish_rule_set(club.id, first.id, context=EmissionContext(actor_user_id=user.id))
    service.publish_rule_set(club.id, second.id, context=EmissionContext(actor_user_id=user.id))
    service.rollback_rule_set(club.id, context=EmissionContext(actor_user_id=user.id))
    assert_event_emitted(
        db_session,
        entity_type="rule_set",
        entity_id=str(first.id),
        action="settings.rule_set.rolled_back",
    )


def test_settings_pricing_matrix_published_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="gs-pp@example.com")
    club = _create_club(db_session, slug="gs-pp")
    _seed_course(db_session, club=club)
    rule_set = _seed_published_rule_set(db_session, club=club)
    matrix = _seed_pricing_matrix(db_session, club=club)
    service = GolfSettingsService(db_session)
    service.publish_rule_set(club.id, rule_set.id, context=EmissionContext(actor_user_id=user.id))
    service.publish_pricing_matrix(
        club.id, matrix.id, context=EmissionContext(actor_user_id=user.id)
    )
    assert_event_emitted(
        db_session,
        entity_type="pricing_matrix",
        entity_id=str(matrix.id),
        action="settings.pricing_matrix.published",
    )


def test_settings_pricing_matrix_rolled_back_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="gs-pr@example.com")
    club = _create_club(db_session, slug="gs-pr")
    _seed_course(db_session, club=club)
    rule_set = _seed_published_rule_set(db_session, club=club)
    first = _seed_pricing_matrix(db_session, club=club)
    second = PricingMatrix(club_id=club.id, name="v2", active=False)
    db_session.add(second)
    db_session.flush()
    db_session.add(
        PricingRule(
            matrix_id=second.id,
            applies_to=PricingRuleAppliesTo.MEMBER,
            player_type=PricingPlayerType.MEMBER_STANDARD,
            holes=18,
            day_type=PricingDayType.ANY,
            season=PricingSeason.ANY,
            time_band=PricingTimeBand.ANY,
            price="400.00",
            currency="ZAR",
            active=True,
        )
    )
    db_session.commit()
    service = GolfSettingsService(db_session)
    service.publish_rule_set(club.id, rule_set.id, context=EmissionContext(actor_user_id=user.id))
    service.publish_pricing_matrix(
        club.id, first.id, context=EmissionContext(actor_user_id=user.id)
    )
    service.publish_pricing_matrix(
        club.id, second.id, context=EmissionContext(actor_user_id=user.id)
    )
    service.rollback_pricing_matrix(club.id, context=EmissionContext(actor_user_id=user.id))
    assert_event_emitted(
        db_session,
        entity_type="pricing_matrix",
        entity_id=str(first.id),
        action="settings.pricing_matrix.rolled_back",
    )
