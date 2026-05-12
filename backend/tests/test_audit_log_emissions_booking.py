"""Audit-log coverage matrix (booking lifecycle).

One test per registered emission across the booking lifecycle, finance, and settings services. Each test invokes the
service method directly with minimal fixtures, then asserts the matching
DomainEventRecord row exists via the conftest helper.

Snapshot assertions check structural presence (the right keys), not value
equality — value comparison is brittle and a separate concern.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.events.emission_context import EmissionContext
from app.models import (
    AccountCustomer,
    Booking,
    BookingParticipantType,
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
    TeeSheetSlotState,
    User,
)
from app.schemas.bookings import (
    BookingCancelRequest,
    BookingChargePostRequest,
    BookingCheckInRequest,
    BookingCompleteRequest,
    BookingCreateParticipantInput,
    BookingCreateRequest,
    BookingMoveRequest,
    BookingNoShowRequest,
    BookingPaymentRecordRequest,
    BookingPaymentStatusUpdateRequest,
    BookingRefundRequest,
    BookingUpdateRequest,
)
from app.services.booking_cancellation_service import BookingCancellationService
from app.services.booking_checkin_service import BookingCheckInService
from app.services.booking_completion_service import BookingCompletionService
from app.services.booking_finance_service import BookingFinanceService
from app.services.booking_move_service import BookingMoveService
from app.services.booking_no_show_service import BookingNoShowService
from app.services.booking_service import BookingService
from app.services.booking_update_service import BookingUpdateService
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


# ---------- Booking lifecycle --------------------------------------------


def test_booking_create_emits_event(db_session: Session) -> None:
    member = _create_user(db_session, email="bm-create@example.com")
    club = _create_club(db_session, slug="bm-create")
    _assign_membership(
        db_session, person_id=member.person_id, club_id=club.id, role=ClubMembershipRole.MEMBER
    )
    course, tee = _seed_course(db_session, club=club)
    db_session.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                day: {"open": "06:00", "close": "18:00", "closed": False}
                for day in [
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                ]
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
    db_session.add(ruleset)
    db_session.flush()
    db_session.add(
        BookingRule(
            ruleset_id=ruleset.id,
            type=BookingRuleType.ADVANCE_WINDOW,
            evaluation_order=0,
            config={"days": 14},
            active=True,
        )
    )
    matrix = PricingMatrix(club_id=club.id, name="Standard", active=True)
    db_session.add(matrix)
    db_session.flush()
    db_session.add(
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
    slot_datetime = datetime(2026, 6, 10, 7, 0, tzinfo=UTC)
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=slot_datetime,
            player_capacity=4,
            manually_blocked=False,
            reserved_state_active=False,
            competition_controlled=False,
            event_controlled=False,
            externally_unavailable=False,
        )
    )
    db_session.commit()

    service = BookingService(db_session)
    result = service.create_booking(
        club.id,
        BookingCreateRequest(
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=slot_datetime,
            source=BookingSource.ADMIN,
            applies_to=BookingRuleAppliesTo.MEMBER,
            reference_datetime=datetime(2026, 6, 5, 6, 0, tzinfo=UTC),
            cart_flag=False,
            caddie_flag=False,
            participants=[
                BookingCreateParticipantInput(
                    participant_type=BookingParticipantType.MEMBER,
                    person_id=member.person_id,
                    is_primary=True,
                )
            ],
        ),
        context=EmissionContext(actor_user_id=member.id, source_channel="web"),
    )
    assert result.booking is not None
    event = assert_event_emitted(
        db_session,
        entity_type="booking",
        entity_id=str(result.booking.id),
        action="booking.created",
        context=EmissionContext(actor_user_id=member.id, source_channel="web"),
    )
    payload = event.payload or {}
    assert "after" in payload
    assert payload.get("before") is None


def test_booking_cancel_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="bm-cancel@example.com")
    club = _create_club(db_session, slug="bm-cancel")
    course, _ = _seed_course(db_session, club=club)
    booking = _seed_booking(
        db_session,
        club=club,
        course=course,
        person=user.person if user.person else _create_person(db_session, email="other@x.com"),
    )
    BookingCancellationService(db_session).cancel_booking(
        club.id,
        BookingCancelRequest(booking_id=booking.id, acting_user_id=user.id),
        context=EmissionContext(actor_user_id=user.id, source_channel="web"),
    )
    event = assert_event_emitted(
        db_session,
        entity_type="booking",
        entity_id=str(booking.id),
        action="booking.cancelled",
        context=EmissionContext(actor_user_id=user.id, source_channel="web"),
    )
    payload = event.payload or {}
    assert payload.get("before", {}).get("status") == BookingStatus.RESERVED.value
    assert payload.get("after", {}).get("status") == BookingStatus.CANCELLED.value


def test_booking_check_in_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="bm-checkin@example.com")
    club = _create_club(db_session, slug="bm-checkin")
    course, _ = _seed_course(db_session, club=club)
    booking = _seed_booking(db_session, club=club, course=course, person=user.person)
    BookingCheckInService(db_session).check_in_booking(
        club.id,
        BookingCheckInRequest(booking_id=booking.id, acting_user_id=user.id),
        context=EmissionContext(actor_user_id=user.id),
    )
    event = assert_event_emitted(
        db_session,
        entity_type="booking",
        entity_id=str(booking.id),
        action="booking.checked_in",
    )
    payload = event.payload or {}
    assert payload.get("after", {}).get("status") == BookingStatus.CHECKED_IN.value


def test_booking_complete_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="bm-complete@example.com")
    club = _create_club(db_session, slug="bm-complete")
    course, _ = _seed_course(db_session, club=club)
    booking = _seed_booking(
        db_session,
        club=club,
        course=course,
        person=user.person,
        status=BookingStatus.CHECKED_IN,
    )
    BookingCompletionService(db_session).complete_booking(
        club.id,
        BookingCompleteRequest(booking_id=booking.id, acting_user_id=user.id),
        context=EmissionContext(actor_user_id=user.id),
    )
    event = assert_event_emitted(
        db_session,
        entity_type="booking",
        entity_id=str(booking.id),
        action="booking.completed",
    )
    payload = event.payload or {}
    assert payload.get("before", {}).get("status") == BookingStatus.CHECKED_IN.value
    assert payload.get("after", {}).get("status") == BookingStatus.COMPLETED.value


def test_booking_no_show_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="bm-noshow@example.com")
    club = _create_club(db_session, slug="bm-noshow")
    course, _ = _seed_course(db_session, club=club)
    booking = _seed_booking(db_session, club=club, course=course, person=user.person)
    BookingNoShowService(db_session).mark_no_show(
        club.id,
        BookingNoShowRequest(booking_id=booking.id, acting_user_id=user.id),
        context=EmissionContext(actor_user_id=user.id),
    )
    event = assert_event_emitted(
        db_session,
        entity_type="booking",
        entity_id=str(booking.id),
        action="booking.no_show",
    )
    payload = event.payload or {}
    assert payload.get("after", {}).get("status") == BookingStatus.NO_SHOW.value


def test_booking_move_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="bm-move@example.com")
    club = _create_club(db_session, slug="bm-move")
    _seed_club_config(db_session, club=club)
    course, tee = _seed_course(db_session, club=club)
    original_slot = datetime(2026, 6, 1, 7, 0, tzinfo=UTC)
    target_slot = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
    booking = _seed_booking(
        db_session, club=club, course=course, person=user.person, slot_datetime=original_slot
    )
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=None,
            slot_datetime=target_slot,
            player_capacity=4,
            manually_blocked=False,
            reserved_state_active=False,
            competition_controlled=False,
            event_controlled=False,
            externally_unavailable=False,
        )
    )
    db_session.commit()

    result = BookingMoveService(db_session).move_booking(
        club.id,
        BookingMoveRequest(
            booking_id=booking.id,
            target_slot_datetime=target_slot,
            target_tee_id=None,
            target_start_lane=None,
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    assert result.transition_applied, f"move was blocked: {result.failures!r}"
    event = assert_event_emitted(
        db_session,
        entity_type="booking",
        entity_id=str(booking.id),
        action="booking.moved",
    )
    payload = event.payload or {}
    assert "before" in payload and "after" in payload
    assert payload["before"]["slot_datetime"] != payload["after"]["slot_datetime"]


def test_booking_update_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="bm-update@example.com")
    club = _create_club(db_session, slug="bm-update")
    _seed_club_config(db_session, club=club)
    _assign_membership(
        db_session, person_id=user.person_id, club_id=club.id, role=ClubMembershipRole.MEMBER
    )
    course, tee = _seed_course(db_session, club=club)
    ruleset = BookingRuleSet(
        club_id=club.id,
        name="Base",
        applies_to=BookingRuleAppliesTo.MEMBER,
        scope_type=BookingRuleScopeType.CLUB,
        conflict_strategy=BookingRuleConflictStrategy.MERGE,
        priority=100,
        active=True,
    )
    db_session.add(ruleset)
    db_session.flush()
    db_session.add(
        BookingRule(
            ruleset_id=ruleset.id,
            type=BookingRuleType.ADVANCE_WINDOW,
            evaluation_order=0,
            config={"days": 365},
            active=True,
        )
    )
    matrix = PricingMatrix(club_id=club.id, name="Standard", active=True)
    db_session.add(matrix)
    db_session.flush()
    db_session.add(
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
    slot_datetime = datetime(2026, 6, 1, 7, 0, tzinfo=UTC)
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=slot_datetime,
            player_capacity=4,
            manually_blocked=False,
            reserved_state_active=False,
            competition_controlled=False,
            event_controlled=False,
            externally_unavailable=False,
        )
    )
    db_session.commit()
    booking = _seed_booking(
        db_session, club=club, course=course, person=user.person, slot_datetime=slot_datetime
    )
    booking.tee_id = tee.id
    db_session.add(booking)
    db_session.commit()
    result = BookingUpdateService(db_session).update_booking(
        club.id,
        booking_id=booking.id,
        payload=BookingUpdateRequest(
            cart_flag=True,
            caddie_flag=False,
            holes=18,
            applies_to=BookingRuleAppliesTo.MEMBER,
            participants=[
                BookingCreateParticipantInput(
                    participant_type=BookingParticipantType.MEMBER,
                    person_id=user.person_id,
                    is_primary=True,
                )
            ],
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    assert result.decision.value == "allowed", f"update blocked: {result.failures!r}"
    event = assert_event_emitted(
        db_session,
        entity_type="booking",
        entity_id=str(booking.id),
        action="booking.updated",
    )
    payload = event.payload or {}
    assert "before" in payload and "after" in payload


def test_booking_charge_posted_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="bm-charge@example.com")
    club = _create_club(db_session, slug="bm-charge")
    course, _ = _seed_course(db_session, club=club)
    booking = _seed_booking(
        db_session,
        club=club,
        course=course,
        person=user.person,
        payment_status=BookingPaymentStatus.PENDING,
    )
    booking.fee_amount = Decimal("325.00")
    booking.fee_currency = "ZAR"
    db_session.add(booking)
    _, _ = _seed_finance_account(db_session, club=club, person=user.person)
    db_session.commit()

    BookingFinanceService(db_session).post_charge(
        club_id=club.id,
        payload=BookingChargePostRequest(
            booking_id=booking.id, acting_user_id=user.id, amount=Decimal("325.00")
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    assert_event_emitted(
        db_session,
        entity_type="booking",
        entity_id=str(booking.id),
        action="booking.charge_posted",
    )


def test_booking_payment_recorded_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="bm-pay@example.com")
    club = _create_club(db_session, slug="bm-pay")
    course, _ = _seed_course(db_session, club=club)
    booking = _seed_booking(
        db_session,
        club=club,
        course=course,
        person=user.person,
        payment_status=BookingPaymentStatus.PENDING,
    )
    booking.fee_amount = Decimal("325.00")
    booking.fee_currency = "ZAR"
    db_session.add(booking)
    _, _ = _seed_finance_account(db_session, club=club, person=user.person)
    db_session.commit()

    service = BookingFinanceService(db_session)
    service.post_charge(
        club_id=club.id,
        payload=BookingChargePostRequest(
            booking_id=booking.id, acting_user_id=user.id, amount=Decimal("325.00")
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    service.record_payment(
        club_id=club.id,
        payload=BookingPaymentRecordRequest(booking_id=booking.id, acting_user_id=user.id),
        context=EmissionContext(actor_user_id=user.id),
    )
    assert_event_emitted(
        db_session,
        entity_type="booking",
        entity_id=str(booking.id),
        action="booking.payment_recorded",
    )


def test_booking_refund_issued_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="bm-refund@example.com")
    club = _create_club(db_session, slug="bm-refund")
    course, _ = _seed_course(db_session, club=club)
    booking = _seed_booking(
        db_session,
        club=club,
        course=course,
        person=user.person,
        payment_status=BookingPaymentStatus.PENDING,
    )
    booking.fee_amount = Decimal("325.00")
    booking.fee_currency = "ZAR"
    db_session.add(booking)
    _, _ = _seed_finance_account(db_session, club=club, person=user.person)
    db_session.commit()
    service = BookingFinanceService(db_session)
    service.post_charge(
        club_id=club.id,
        payload=BookingChargePostRequest(
            booking_id=booking.id, acting_user_id=user.id, amount=Decimal("325.00")
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    service.record_payment(
        club_id=club.id,
        payload=BookingPaymentRecordRequest(booking_id=booking.id, acting_user_id=user.id),
        context=EmissionContext(actor_user_id=user.id),
    )
    service.post_refund(
        club_id=club.id,
        payload=BookingRefundRequest(
            booking_id=booking.id, acting_user_id=user.id, amount=Decimal("100.00")
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    assert_event_emitted(
        db_session,
        entity_type="booking",
        entity_id=str(booking.id),
        action="booking.refund_issued",
    )


def test_booking_payment_status_updated_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="bm-pstatus@example.com")
    club = _create_club(db_session, slug="bm-pstatus")
    course, _ = _seed_course(db_session, club=club)
    booking = _seed_booking(
        db_session,
        club=club,
        course=course,
        person=user.person,
        payment_status=BookingPaymentStatus.PENDING,
    )
    BookingFinanceService(db_session).update_payment_status(
        club_id=club.id,
        payload=BookingPaymentStatusUpdateRequest(
            booking_id=booking.id,
            acting_user_id=user.id,
            payment_status=BookingPaymentStatus.WAIVED,
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    event = assert_event_emitted(
        db_session,
        entity_type="booking",
        entity_id=str(booking.id),
        action="booking.payment_status_updated",
    )
    payload = event.payload or {}
    assert payload.get("after", {}).get("payment_status") == BookingPaymentStatus.WAIVED.value
