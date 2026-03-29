from __future__ import annotations

from datetime import date, datetime, time, timezone

from sqlalchemy.orm import Session

from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Booking,
    BookingParticipant,
    BookingParticipantType,
    BookingSource,
    BookingStatus,
    Club,
    Course,
    Person,
    PricingDayType,
    PricingTimeBand,
    Tee,
    TeeSheetSlotState,
)
from app.schemas.rule_context import (
    DayTypeResolution,
    NormalizedRuleContext,
    NormalizedScopeContext,
    TimeBandResolution,
)
from app.services.booking_state_service import BookingStateService


def _create_person(db: Session, *, first_name: str, last_name: str, email: str) -> Person:
    person = Person(
        first_name=first_name,
        last_name=last_name,
        full_name=build_full_name(first_name, last_name),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.flush()
    return person


def test_booking_aggregate_persists_primary_person_and_ordered_participants(db_session: Session) -> None:
    club = Club(name="Booking Club", slug="booking-club", timezone="Africa/Johannesburg")
    db_session.add(club)
    db_session.flush()
    course = Course(club_id=club.id, name="North", holes=18, active=True)
    db_session.add(course)
    db_session.flush()
    tee = Tee(
        course_id=course.id,
        name="Blue",
        gender=None,
        slope_rating=128,
        course_rating="72.4",
        color_code="#1b4d8f",
        active=True,
    )
    db_session.add(tee)
    primary_person = _create_person(db_session, first_name="Alex", last_name="Member", email="alex.member@example.com")
    guest_person = _create_person(db_session, first_name="Jamie", last_name="Guest", email="jamie.guest@example.com")
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        slot_datetime=datetime(2026, 4, 1, 6, 0, tzinfo=timezone.utc),
        slot_interval_minutes=10,
        status=BookingStatus.RESERVED,
        source=BookingSource.ADMIN,
        party_size=2,
        primary_person_id=primary_person.id,
        primary_membership_id=None,
        participants=[
            BookingParticipant(
                person_id=primary_person.id,
                club_membership_id=None,
                participant_type=BookingParticipantType.MEMBER,
                display_name="Alex Member",
                guest_name=None,
                sort_order=0,
                is_primary=True,
            ),
            BookingParticipant(
                person_id=guest_person.id,
                club_membership_id=None,
                participant_type=BookingParticipantType.GUEST,
                display_name="Jamie Guest",
                guest_name="Jamie Guest",
                sort_order=1,
                is_primary=False,
            ),
        ],
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)

    assert booking.primary_person_id == primary_person.id
    assert booking.party_size == 2
    assert [participant.sort_order for participant in booking.participants] == [0, 1]
    assert booking.participants[0].participant_type == BookingParticipantType.MEMBER
    assert booking.participants[1].participant_type == BookingParticipantType.GUEST


def test_booking_state_service_maps_persisted_bookings_into_decision_input(db_session: Session) -> None:
    club = Club(name="State Club", slug="state-club", timezone="Africa/Johannesburg")
    db_session.add(club)
    db_session.flush()
    course = Course(club_id=club.id, name="North", holes=18, active=True)
    db_session.add(course)
    db_session.flush()

    slot_datetime = datetime(2026, 4, 1, 6, 0, tzinfo=timezone.utc)
    reserved_booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=None,
        slot_datetime=slot_datetime,
        slot_interval_minutes=10,
        status=BookingStatus.RESERVED,
        source=BookingSource.ADMIN,
        party_size=2,
        primary_person_id=None,
        primary_membership_id=None,
        participants=[
            BookingParticipant(
                participant_type=BookingParticipantType.MEMBER,
                display_name="Member One",
                guest_name=None,
                sort_order=0,
                is_primary=True,
                person_id=None,
                club_membership_id=None,
            ),
            BookingParticipant(
                participant_type=BookingParticipantType.GUEST,
                display_name="Guest One",
                guest_name="Guest One",
                sort_order=1,
                is_primary=False,
                person_id=None,
                club_membership_id=None,
            ),
        ],
    )
    checked_in_booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=None,
        slot_datetime=slot_datetime,
        slot_interval_minutes=10,
        status=BookingStatus.CHECKED_IN,
        source=BookingSource.STAFF,
        party_size=1,
        primary_person_id=None,
        primary_membership_id=None,
        participants=[
            BookingParticipant(
                participant_type=BookingParticipantType.STAFF,
                display_name="Staff One",
                guest_name=None,
                sort_order=0,
                is_primary=True,
                person_id=None,
                club_membership_id=None,
            )
        ],
    )
    cancelled_booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=None,
        slot_datetime=slot_datetime,
        slot_interval_minutes=10,
        status=BookingStatus.CANCELLED,
        source=BookingSource.ADMIN,
        party_size=1,
        primary_person_id=None,
        primary_membership_id=None,
        participants=[
            BookingParticipant(
                participant_type=BookingParticipantType.GUEST,
                display_name="Cancelled Guest",
                guest_name="Cancelled Guest",
                sort_order=0,
                is_primary=False,
                person_id=None,
                club_membership_id=None,
            )
        ],
    )
    slot_state = TeeSheetSlotState(
        club_id=club.id,
        course_id=course.id,
        tee_id=None,
        slot_datetime=slot_datetime,
        player_capacity=4,
        manually_blocked=False,
        reserved_state_active=False,
        competition_controlled=False,
        event_controlled=False,
        externally_unavailable=False,
    )
    context = NormalizedRuleContext(
        club_id=club.id,
        course_id=course.id,
        tee_id=None,
        applies_to=None,
        membership_role=None,
        effective_datetime=slot_datetime,
        reference_datetime=slot_datetime,
        timezone="Africa/Johannesburg",
        local_date=date(2026, 4, 1),
        local_time=time(8, 0),
        local_day_name="wednesday",
        reference_local_date=date(2026, 4, 1),
        reference_local_time=time(8, 0),
        day_type=PricingDayType.WEEKDAY,
        time_band=PricingTimeBand.MORNING,
        time_band_ref=None,
        day_type_resolution=DayTypeResolution(
            value=PricingDayType.WEEKDAY,
            source="supplied",
            holiday_strategy="supplied_override",
        ),
        time_band_resolution=TimeBandResolution(
            value=PricingTimeBand.MORNING,
            source="supplied",
            contract="supplied",
            time_band_ref=None,
        ),
        scope_context=NormalizedScopeContext(club_ref=str(club.id), course_ref=str(course.id), tee_ref=None),
        warnings=[],
        unsupported=[],
    )

    service = BookingStateService(db_session)
    party_input, booking_state_input = service.build_inputs_from_persisted_state(
        bookings=[reserved_booking, checked_in_booking, cancelled_booking],
        slot_state=slot_state,
    )
    decision_input = service.build_decision_input_from_persisted_state(
        context,
        bookings=[reserved_booking, checked_in_booking, cancelled_booking],
        slot_state=slot_state,
        slot_interval_minutes=10,
    )

    assert party_input.member_count == 1
    assert party_input.guest_count == 1
    assert party_input.staff_count == 1
    assert booking_state_input.occupancy.reserved_player_count == 2
    assert booking_state_input.occupancy.occupied_player_count == 1
    assert booking_state_input.occupancy.reserved_booking_count == 1
    assert booking_state_input.occupancy.confirmed_booking_count == 1
    assert decision_input.party.requested_player_count == 3
    assert decision_input.booking_state.occupancy.remaining_player_capacity == 1
