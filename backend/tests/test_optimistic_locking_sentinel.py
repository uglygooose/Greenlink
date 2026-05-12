"""Optimistic-locking regression sentinel.

PRODUCT.md §3.1 commits GreenLink to "concurrency-safe by design.
Optimistic locking with a five-minute hold on slot selection. Two staff
members on two devices cannot accidentally double-book." That guarantee
is NOT yet implemented in the booking pipeline today — `BookingService`
validates against the current slot state but does not acquire a
slot-level hold or version stamp, so two distinct SQLAlchemy sessions
can each commit a booking for the same slot without conflict.

This file proves the bug currently reproduces. When optimistic locking
lands in a later phase, the second commit will start failing — and the
strict assertion below (`both decisions ALLOWED`) will flip to a hard
test failure. That's the desired discipline: the future implementer is
forced to convert this sentinel to a positive assertion of the locking
contract.

When optimistic locking lands, this test will start failing because the
second commit will raise (or return BLOCKED). At that point, convert
each test to:
  - assert the first commit succeeds
  - assert the second commit raises/blocks with the locking error
  - rename to test_concurrent_create_booking_is_locked (or similar)
The current shape is the regression sentinel for the bug PRODUCT.md
§3.1 requires us to close.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Booking,
    BookingParticipantType,
    BookingRule,
    BookingRuleAppliesTo,
    BookingRuleConflictStrategy,
    BookingRuleScopeType,
    BookingRuleSet,
    BookingRuleType,
    BookingSource,
    Club,
    ClubConfig,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    DomainEventRecord,
    Person,
    PricingDayType,
    PricingMatrix,
    PricingPlayerType,
    PricingRule,
    PricingRuleAppliesTo,
    PricingSeason,
    PricingTimeBand,
    Tee,
    TeeSheetSlotState,
    User,
)
from app.schemas.bookings import (
    BookingCreateDecision,
    BookingCreateParticipantInput,
    BookingCreateRequest,
)
from app.services.booking_service import BookingService

SLOT_DATETIME = datetime(2026, 6, 1, 7, 0, tzinfo=UTC)
REFERENCE_DATETIME = datetime(2026, 5, 25, 6, 0, tzinfo=UTC)


@pytest.fixture()
def second_session(db_session: Session) -> Iterator[Session]:
    """Independent SQLAlchemy session bound to the same engine.

    Conftest's ``db_session`` already owns the engine + schema lifecycle;
    this fixture only opens a second connection so the test can simulate
    "two staff members on two devices" without threading.
    """
    factory = sessionmaker(
        bind=db_session.bind,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )
    session = factory()
    try:
        yield session
    finally:
        session.close()


def _create_user_with_membership(
    db: Session, *, email: str, club: Club, role: ClubMembershipRole = ClubMembershipRole.MEMBER
) -> User:
    local = email.split("@")[0]
    person = Person(
        first_name=local.title(),
        last_name="Member",
        full_name=build_full_name(local.title(), "Member"),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.flush()
    user = User(
        email=email,
        password_hash=hash_password("password123"),
        display_name=local,
        person_id=person.id,
    )
    db.add(user)
    db.flush()
    db.add(
        ClubMembership(
            person_id=person.id,
            club_id=club.id,
            role=role,
            status=ClubMembershipStatus.ACTIVE,
            is_primary=True,
        )
    )
    db.commit()
    db.refresh(user)
    return user


def _seed_concurrent_booking_environment(
    db: Session,
) -> tuple[Club, Course, Tee, User, User]:
    club = Club(name="Lock Test Club", slug="lock-test-club", timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
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
    db.add(
        ClubConfig(
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
    )
    ruleset = BookingRuleSet(
        club_id=club.id,
        name="Base",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        conflict_strategy=BookingRuleConflictStrategy.MERGE,
        priority=100,
        active=True,
    )
    db.add(ruleset)
    db.flush()
    db.add(
        BookingRule(
            ruleset_id=ruleset.id,
            type=BookingRuleType.ADVANCE_WINDOW,
            evaluation_order=0,
            config={"days": 365},
            active=True,
        )
    )
    matrix = PricingMatrix(club_id=club.id, name="Standard", active=True)
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
    db.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=SLOT_DATETIME,
            player_capacity=4,
            manually_blocked=False,
            reserved_state_active=False,
            competition_controlled=False,
            event_controlled=False,
            externally_unavailable=False,
        )
    )
    db.commit()
    member_a = _create_user_with_membership(db, email="lock-a@example.com", club=club)
    member_b = _create_user_with_membership(db, email="lock-b@example.com", club=club)
    return club, course, tee, member_a, member_b


def _booking_payload(
    *, course_id: uuid.UUID, tee_id: uuid.UUID, person_id: uuid.UUID
) -> BookingCreateRequest:
    return BookingCreateRequest(
        course_id=course_id,
        tee_id=tee_id,
        slot_datetime=SLOT_DATETIME,
        source=BookingSource.ADMIN,
        applies_to=BookingRuleAppliesTo.MEMBER,
        reference_datetime=REFERENCE_DATETIME,
        cart_flag=False,
        caddie_flag=False,
        participants=[
            BookingCreateParticipantInput(
                participant_type=BookingParticipantType.MEMBER,
                person_id=person_id,
                is_primary=True,
            )
        ],
    )


def test_concurrent_create_booking_currently_double_books(
    db_session: Session, second_session: Session
) -> None:
    """Two distinct sessions both successfully book the same slot today.

    This asserts the BUG. When optimistic locking lands, the second
    booking will be blocked by the slot hold and this test will fail —
    forcing the implementer to convert it to a positive assertion of
    the locking contract. See module docstring for the conversion plan.
    """
    club, course, tee, member_a, member_b = _seed_concurrent_booking_environment(db_session)

    result_a = BookingService(db_session).create_booking(
        club.id,
        _booking_payload(course_id=course.id, tee_id=tee.id, person_id=member_a.person_id),
    )
    result_b = BookingService(second_session).create_booking(
        club.id,
        _booking_payload(course_id=course.id, tee_id=tee.id, person_id=member_b.person_id),
    )

    assert result_a.decision == BookingCreateDecision.ALLOWED, (
        f"first booking unexpectedly blocked: {result_a.failures!r}"
    )
    assert result_b.decision == BookingCreateDecision.ALLOWED, (
        "REGRESSION SIGNAL: second booking is now blocked. If optimistic "
        "locking has landed, convert this test to assert the locking "
        f"contract per the module docstring. Failures: {result_b.failures!r}"
    )

    persisted = list(
        db_session.scalars(
            select(Booking).where(
                Booking.club_id == club.id,
                Booking.slot_datetime == SLOT_DATETIME,
            )
        ).all()
    )
    assert len(persisted) == 2, f"expected two bookings for the same slot, got {len(persisted)}"


def test_concurrent_create_booking_emits_distinct_audit_events(
    db_session: Session, second_session: Session
) -> None:
    """Two concurrent bookings emit two distinct booking.created events.

    Pairs with the audit-log emission work: the audit-log feature store
    captures the race so the bug is visible to anyone reading the log.
    When optimistic locking lands, this becomes one booking.created
    event plus (likely) one slot-hold-rejection event — the phase that
    implements locking decides the exact emission shape.
    """
    club, course, tee, member_a, member_b = _seed_concurrent_booking_environment(db_session)

    BookingService(db_session).create_booking(
        club.id,
        _booking_payload(course_id=course.id, tee_id=tee.id, person_id=member_a.person_id),
    )
    BookingService(second_session).create_booking(
        club.id,
        _booking_payload(course_id=course.id, tee_id=tee.id, person_id=member_b.person_id),
    )

    booking_ids = [
        str(row.id)
        for row in db_session.scalars(
            select(Booking).where(
                Booking.club_id == club.id,
                Booking.slot_datetime == SLOT_DATETIME,
            )
        ).all()
    ]
    assert len(booking_ids) == 2

    events = list(
        db_session.scalars(
            select(DomainEventRecord).where(
                DomainEventRecord.aggregate_type == "booking",
                DomainEventRecord.event_type == "booking.created",
                DomainEventRecord.aggregate_id.in_(booking_ids),
            )
        ).all()
    )
    assert len(events) == 2, (
        f"expected two booking.created events for the same slot, got {len(events)}"
    )
    assert {event.aggregate_id for event in events} == set(booking_ids)
