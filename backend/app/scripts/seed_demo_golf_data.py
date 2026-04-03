from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Iterable
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.db import SessionLocal
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Booking,
    BookingParticipant,
    BookingParticipantType,
    BookingPaymentStatus,
    BookingSource,
    BookingStatus,
    Club,
    ClubConfig,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Course,
    Person,
    StartLane,
    Tee,
    TeeSheetSlotState,
)
from app.scripts.seed_users import DEV_CLUB_SLUG, DEV_CLUB_TIMEZONE, seed_users

DEMO_COURSE_NAME = "GreenLink Championship Course"
DEMO_TIMEZONE = ZoneInfo(DEV_CLUB_TIMEZONE)
SLOT_INTERVAL_MINUTES = 10
PLAYER_CAPACITY = 4
WINDOW_DAYS_BACK = 90
WINDOW_DAYS_FORWARD = 31


@dataclass(frozen=True, slots=True)
class DemoPersonSeed:
    email: str
    first_name: str
    last_name: str
    membership_number: str
    role: ClubMembershipRole

    @property
    def full_name(self) -> str:
        return build_full_name(self.first_name, self.last_name)


@dataclass(frozen=True, slots=True)
class TeeSeed:
    name: str
    color_code: str
    gender: str
    slope_rating: int
    course_rating: Decimal


@dataclass(frozen=True, slots=True)
class BookingTemplate:
    local_time: time
    tee_name: str
    lane: StartLane
    party_kind: str
    cart_flag: bool
    caddie_flag: bool


DEMO_MEMBERS: tuple[DemoPersonSeed, ...] = tuple(
    DemoPersonSeed(
        email=f"demo.member{index:02d}@greenlink.test",
        first_name=first_name,
        last_name=last_name,
        membership_number=f"GL-DEMO-M{index:03d}",
        role=ClubMembershipRole.MEMBER,
    )
    for index, (first_name, last_name) in enumerate(
        (
            ("Aiden", "Walker"),
            ("Luca", "Bennett"),
            ("Noah", "Campbell"),
            ("Ethan", "Brooks"),
            ("Mila", "Turner"),
            ("Grace", "Sullivan"),
            ("Ella", "Morgan"),
            ("Zara", "Bishop"),
            ("Mason", "Cooper"),
            ("Liam", "Price"),
            ("Olivia", "Reed"),
            ("Harper", "Stone"),
        ),
        start=1,
    )
)

DEMO_STAFF: tuple[DemoPersonSeed, ...] = (
    DemoPersonSeed(
        email="demo.staff01@greenlink.test",
        first_name="Jamie",
        last_name="Starter",
        membership_number="GL-DEMO-S001",
        role=ClubMembershipRole.CLUB_STAFF,
    ),
    DemoPersonSeed(
        email="demo.staff02@greenlink.test",
        first_name="Taylor",
        last_name="Marshal",
        membership_number="GL-DEMO-S002",
        role=ClubMembershipRole.CLUB_STAFF,
    ),
    DemoPersonSeed(
        email="demo.staff03@greenlink.test",
        first_name="Riley",
        last_name="Foreman",
        membership_number="GL-DEMO-S003",
        role=ClubMembershipRole.CLUB_STAFF,
    ),
)

TEE_SEEDS: tuple[TeeSeed, ...] = (
    TeeSeed(
        name="Blue",
        color_code="#1B4D8F",
        gender="mixed",
        slope_rating=129,
        course_rating=Decimal("72.4"),
    ),
    TeeSeed(
        name="White",
        color_code="#2F6C3D",
        gender="mixed",
        slope_rating=123,
        course_rating=Decimal("70.8"),
    ),
)

BOOKING_TEMPLATES: tuple[BookingTemplate, ...] = (
    BookingTemplate(time(hour=6, minute=40), "Blue", StartLane.HOLE_1, "member_pair", True, False),
    BookingTemplate(time(hour=6, minute=50), "Blue", StartLane.HOLE_10, "member_guest", False, True),
    BookingTemplate(time(hour=7, minute=0), "White", StartLane.HOLE_1, "fourball", True, False),
    BookingTemplate(time(hour=7, minute=20), "White", StartLane.HOLE_10, "member_triple", False, False),
    BookingTemplate(time(hour=7, minute=40), "Blue", StartLane.HOLE_1, "member_guest", True, True),
    BookingTemplate(time(hour=8, minute=0), "White", StartLane.HOLE_1, "staff_hosted", False, False),
    BookingTemplate(time(hour=8, minute=20), "Blue", StartLane.HOLE_10, "member_pair", True, False),
    BookingTemplate(time(hour=9, minute=0), "White", StartLane.HOLE_10, "fourball", False, False),
)


def demo_operating_hours() -> dict[str, dict[str, object]]:
    return {
        "monday": {"open": "06:00", "close": "17:30"},
        "tuesday": {"open": "06:00", "close": "17:30"},
        "wednesday": {"open": "06:00", "close": "17:30"},
        "thursday": {"open": "06:00", "close": "17:30"},
        "friday": {"open": "06:00", "close": "18:00"},
        "saturday": {"open": "05:50", "close": "18:00"},
        "sunday": {"open": "06:20", "close": "17:00"},
    }


def daterange(start_date: date, end_date: date) -> Iterable[date]:
    current = start_date
    while current <= end_date:
        yield current
        current += timedelta(days=1)


def slot_datetimes_for_day(local_day: date, operating_hours: dict[str, dict[str, object]]) -> list[datetime]:
    hours = operating_hours[local_day.strftime("%A").lower()]
    open_value = hours["open"]
    close_value = hours["close"]
    open_hours, open_minutes = str(open_value).split(":")
    close_hours, close_minutes = str(close_value).split(":")
    current_local = datetime.combine(
        local_day,
        time(hour=int(open_hours), minute=int(open_minutes)),
        tzinfo=DEMO_TIMEZONE,
    )
    close_local = datetime.combine(
        local_day,
        time(hour=int(close_hours), minute=int(close_minutes)),
        tzinfo=DEMO_TIMEZONE,
    )
    slots: list[datetime] = []
    while current_local < close_local:
        slots.append(current_local.astimezone(UTC))
        current_local += timedelta(minutes=SLOT_INTERVAL_MINUTES)
    return slots


def upsert_club_config(db, club: Club) -> ClubConfig:
    config = db.scalar(select(ClubConfig).where(ClubConfig.club_id == club.id))
    operating_hours = demo_operating_hours()
    if config is None:
        config = ClubConfig(
            club_id=club.id,
            timezone=DEV_CLUB_TIMEZONE,
            operating_hours=operating_hours,
            booking_window_days=180,
            cancellation_policy_hours=24,
            default_slot_interval_minutes=SLOT_INTERVAL_MINUTES,
        )
        db.add(config)
        db.flush()
        return config

    config.timezone = DEV_CLUB_TIMEZONE
    config.operating_hours = operating_hours
    config.booking_window_days = 180
    config.cancellation_policy_hours = 24
    config.default_slot_interval_minutes = SLOT_INTERVAL_MINUTES
    return config


def upsert_course(db, club: Club) -> Course:
    course = db.scalar(select(Course).where(Course.club_id == club.id, Course.name == DEMO_COURSE_NAME))
    if course is None:
        course = Course(club_id=club.id, name=DEMO_COURSE_NAME, holes=18, active=True)
        db.add(course)
        db.flush()
        return course

    course.holes = 18
    course.active = True
    return course


def upsert_tee(db, course: Course, seed: TeeSeed) -> Tee:
    tee = db.scalar(select(Tee).where(Tee.course_id == course.id, Tee.name == seed.name))
    if tee is None:
        tee = Tee(
            course_id=course.id,
            name=seed.name,
            gender=seed.gender,
            slope_rating=seed.slope_rating,
            course_rating=seed.course_rating,
            color_code=seed.color_code,
            active=True,
        )
        db.add(tee)
        db.flush()
        return tee

    tee.gender = seed.gender
    tee.slope_rating = seed.slope_rating
    tee.course_rating = seed.course_rating
    tee.color_code = seed.color_code
    tee.active = True
    return tee


def upsert_person_and_membership(db, club: Club, seed: DemoPersonSeed) -> ClubMembership:
    normalized_email = normalize_email(seed.email)
    person = db.scalar(select(Person).where(Person.normalized_email == normalized_email))
    if person is None:
        person = Person(
            first_name=seed.first_name,
            last_name=seed.last_name,
            full_name=seed.full_name,
            email=normalized_email,
            normalized_email=normalized_email,
            profile_metadata={"demo_seed": True},
        )
        db.add(person)
        db.flush()
    else:
        person.first_name = seed.first_name
        person.last_name = seed.last_name
        person.full_name = seed.full_name
        person.email = normalized_email
        person.normalized_email = normalized_email
        metadata = dict(person.profile_metadata or {})
        metadata["demo_seed"] = True
        person.profile_metadata = metadata

    membership = db.scalar(
        select(ClubMembership).where(
            ClubMembership.person_id == person.id,
            ClubMembership.club_id == club.id,
        )
    )
    if membership is None:
        membership = ClubMembership(
            person_id=person.id,
            club_id=club.id,
            role=seed.role,
            status=ClubMembershipStatus.ACTIVE,
            is_primary=True,
            membership_number=seed.membership_number,
            membership_metadata={"demo_seed": True},
        )
        db.add(membership)
        db.flush()
        return membership

    membership.role = seed.role
    membership.status = ClubMembershipStatus.ACTIVE
    membership.is_primary = True
    membership.membership_number = seed.membership_number
    metadata = dict(membership.membership_metadata or {})
    metadata["demo_seed"] = True
    membership.membership_metadata = metadata
    db.flush()
    return membership


def delete_existing_window_data(db, club: Club, course: Course, start_utc: datetime, end_utc: datetime) -> None:
    db.execute(
        delete(Booking).where(
            Booking.club_id == club.id,
            Booking.course_id == course.id,
            Booking.slot_datetime >= start_utc,
            Booking.slot_datetime < end_utc,
        )
    )
    db.execute(
        delete(TeeSheetSlotState).where(
            TeeSheetSlotState.club_id == club.id,
            TeeSheetSlotState.course_id == course.id,
            TeeSheetSlotState.slot_datetime >= start_utc,
            TeeSheetSlotState.slot_datetime < end_utc,
        )
    )


def block_reason(local_day: date, slot_time: time, tee_name: str, lane: StartLane) -> tuple[bool, bool, bool, str | None]:
    weekday = local_day.strftime("%A").lower()
    if weekday == "monday" and slot_time == time(hour=6, minute=0) and lane == StartLane.HOLE_10:
        return True, False, False, "Frost delay buffer"
    if weekday == "wednesday" and slot_time == time(hour=11, minute=0) and tee_name == "White":
        return False, False, True, "Schools clinic hold"
    if weekday == "saturday" and slot_time in {time(hour=7, minute=0), time(hour=7, minute=10), time(hour=7, minute=20)} and lane == StartLane.HOLE_10:
        return False, True, False, "Competition crossover buffer"
    return False, False, False, None


def seed_slot_states(
    db,
    *,
    club: Club,
    course: Course,
    tees_by_name: dict[str, Tee],
    start_date: date,
    end_date: date,
    operating_hours: dict[str, dict[str, object]],
) -> int:
    states: list[TeeSheetSlotState] = []
    for local_day in daterange(start_date, end_date):
        for slot_datetime in slot_datetimes_for_day(local_day, operating_hours):
            slot_time = slot_datetime.astimezone(DEMO_TIMEZONE).time().replace(second=0, microsecond=0)
            for tee in tees_by_name.values():
                for lane in (StartLane.HOLE_1, StartLane.HOLE_10):
                    manually_blocked, reserved_state_active, externally_unavailable, reason = block_reason(
                        local_day, slot_time, tee.name, lane
                    )
                    states.append(
                        TeeSheetSlotState(
                            club_id=club.id,
                            course_id=course.id,
                            tee_id=tee.id,
                            start_lane=lane.value,
                            slot_datetime=slot_datetime,
                            player_capacity=PLAYER_CAPACITY,
                            occupied_player_count=0,
                            reserved_player_count=0,
                            confirmed_booking_count=0,
                            reserved_booking_count=0,
                            member_count=0,
                            guest_count=0,
                            staff_count=0,
                            manually_blocked=manually_blocked,
                            reserved_state_active=reserved_state_active,
                            competition_controlled=reserved_state_active,
                            event_controlled=False,
                            externally_unavailable=externally_unavailable,
                            blocked_reason=reason,
                        )
                    )
    db.add_all(states)
    return len(states)


def booking_status_for_date(local_day: date, *, template_index: int, today: date) -> BookingStatus:
    offset = (local_day - today).days
    if offset > 0:
        return BookingStatus.RESERVED
    if offset == 0:
        return BookingStatus.CHECKED_IN if template_index % 3 == 0 else BookingStatus.RESERVED
    return BookingStatus.CHECKED_IN if template_index % 4 == 0 else BookingStatus.RESERVED


def payment_status_for_template(template_index: int) -> BookingPaymentStatus:
    statuses = (
        BookingPaymentStatus.PENDING,
        BookingPaymentStatus.PAID,
        BookingPaymentStatus.COMPLIMENTARY,
        BookingPaymentStatus.WAIVED,
    )
    return statuses[template_index % len(statuses)]


def fee_label_for_template(local_day: date, template: BookingTemplate, template_index: int) -> str:
    weekend = local_day.weekday() >= 5
    if template.party_kind == "staff_hosted":
        return "Staff Courtesy"
    if template.party_kind in {"member_guest", "fourball"}:
        return "Guest Accompanied Rate" if weekend else "Guest Weekday Rate"
    return "Member Prime Rate" if weekend and template_index % 2 == 0 else "Member Daily Rate"


def booking_participants_for_template(
    *,
    member_memberships: list[ClubMembership],
    staff_memberships: list[ClubMembership],
    day_index: int,
    template_index: int,
    party_kind: str,
) -> tuple[list[BookingParticipant], ClubMembership]:
    member_a = member_memberships[(day_index + template_index) % len(member_memberships)]
    member_b = member_memberships[(day_index + template_index + 3) % len(member_memberships)]
    member_c = member_memberships[(day_index + template_index + 6) % len(member_memberships)]
    staff_a = staff_memberships[(day_index + template_index) % len(staff_memberships)]

    participants: list[BookingParticipant] = []

    def member_participant(membership: ClubMembership, *, sort_order: int, is_primary: bool) -> BookingParticipant:
        return BookingParticipant(
            person_id=membership.person_id,
            club_membership_id=membership.id,
            participant_type=BookingParticipantType.MEMBER,
            display_name=membership.person.full_name,
            guest_name=None,
            sort_order=sort_order,
            is_primary=is_primary,
        )

    def staff_participant(membership: ClubMembership, *, sort_order: int, is_primary: bool) -> BookingParticipant:
        return BookingParticipant(
            person_id=membership.person_id,
            club_membership_id=membership.id,
            participant_type=BookingParticipantType.STAFF,
            display_name=membership.person.full_name,
            guest_name=None,
            sort_order=sort_order,
            is_primary=is_primary,
        )

    def guest_participant(guest_name: str, *, sort_order: int) -> BookingParticipant:
        return BookingParticipant(
            person_id=None,
            club_membership_id=None,
            participant_type=BookingParticipantType.GUEST,
            display_name=guest_name,
            guest_name=guest_name,
            sort_order=sort_order,
            is_primary=False,
        )

    if party_kind == "member_pair":
        participants.extend(
            [
                member_participant(member_a, sort_order=0, is_primary=True),
                member_participant(member_b, sort_order=1, is_primary=False),
            ]
        )
        return participants, member_a

    if party_kind == "member_guest":
        guest_name = f"Guest {day_index % 7 + 1}"
        participants.extend(
            [
                member_participant(member_a, sort_order=0, is_primary=True),
                guest_participant(guest_name, sort_order=1),
            ]
        )
        return participants, member_a

    if party_kind == "member_triple":
        participants.extend(
            [
                member_participant(member_a, sort_order=0, is_primary=True),
                member_participant(member_b, sort_order=1, is_primary=False),
                member_participant(member_c, sort_order=2, is_primary=False),
            ]
        )
        return participants, member_a

    if party_kind == "staff_hosted":
        guest_name = f"Hosted Guest {template_index + 1}"
        participants.extend(
            [
                staff_participant(staff_a, sort_order=0, is_primary=True),
                member_participant(member_a, sort_order=1, is_primary=False),
                guest_participant(guest_name, sort_order=2),
            ]
        )
        return participants, staff_a

    participants.extend(
        [
            member_participant(member_a, sort_order=0, is_primary=True),
            member_participant(member_b, sort_order=1, is_primary=False),
            guest_participant(f"Guest {template_index + 1}", sort_order=2),
            guest_participant(f"Guest {template_index + 2}", sort_order=3),
        ]
    )
    return participants, member_a


def seed_bookings(
    db,
    *,
    club: Club,
    course: Course,
    tees_by_name: dict[str, Tee],
    member_memberships: list[ClubMembership],
    staff_memberships: list[ClubMembership],
    start_date: date,
    end_date: date,
    today: date,
) -> int:
    bookings: list[Booking] = []
    for day_index, local_day in enumerate(daterange(start_date, end_date)):
        for template_index, template in enumerate(BOOKING_TEMPLATES):
            participants, primary_membership = booking_participants_for_template(
                member_memberships=member_memberships,
                staff_memberships=staff_memberships,
                day_index=day_index,
                template_index=template_index,
                party_kind=template.party_kind,
            )
            local_datetime = datetime.combine(local_day, template.local_time, tzinfo=DEMO_TIMEZONE)
            bookings.append(
                Booking(
                    club_id=club.id,
                    course_id=course.id,
                    tee_id=tees_by_name[template.tee_name].id,
                    start_lane=template.lane.value,
                    slot_datetime=local_datetime.astimezone(UTC),
                    slot_interval_minutes=SLOT_INTERVAL_MINUTES,
                    status=booking_status_for_date(local_day, template_index=template_index, today=today),
                    source=BookingSource.ADMIN,
                    party_size=len(participants),
                    primary_person_id=primary_membership.person_id,
                    primary_membership_id=primary_membership.id,
                    cart_flag=template.cart_flag,
                    caddie_flag=template.caddie_flag,
                    fee_label=fee_label_for_template(local_day, template, template_index),
                    payment_status=payment_status_for_template(template_index),
                    participants=participants,
                )
            )
    db.add_all(bookings)
    return len(bookings)


def seed_demo_golf_data() -> None:
    seed_users()
    today = datetime.now(DEMO_TIMEZONE).date()
    start_date = today - timedelta(days=WINDOW_DAYS_BACK)
    end_date = today + timedelta(days=WINDOW_DAYS_FORWARD)
    operating_hours = demo_operating_hours()

    with SessionLocal() as db:
        club = db.scalar(select(Club).where(Club.slug == DEV_CLUB_SLUG))
        if club is None:
            raise RuntimeError("Development club was not found after running seed_users()")

        upsert_club_config(db, club)
        course = upsert_course(db, club)
        tees_by_name = {seed.name: upsert_tee(db, course, seed) for seed in TEE_SEEDS}

        for seed in (*DEMO_MEMBERS, *DEMO_STAFF):
            upsert_person_and_membership(db, club, seed)

        db.flush()

        member_memberships = list(
            db.scalars(
                select(ClubMembership)
                .options(selectinload(ClubMembership.person))
                .where(
                    ClubMembership.club_id == club.id,
                    ClubMembership.status == ClubMembershipStatus.ACTIVE,
                    ClubMembership.role == ClubMembershipRole.MEMBER,
                )
                .order_by(ClubMembership.membership_number.asc())
            ).all()
        )
        staff_memberships = list(
            db.scalars(
                select(ClubMembership)
                .options(selectinload(ClubMembership.person))
                .where(
                    ClubMembership.club_id == club.id,
                    ClubMembership.status == ClubMembershipStatus.ACTIVE,
                    ClubMembership.role.in_(
                        [ClubMembershipRole.CLUB_ADMIN, ClubMembershipRole.CLUB_STAFF]
                    ),
                )
                .order_by(ClubMembership.membership_number.asc())
            ).all()
        )

        start_utc = datetime.combine(start_date, time.min, tzinfo=DEMO_TIMEZONE).astimezone(UTC)
        end_utc = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=DEMO_TIMEZONE).astimezone(UTC)
        delete_existing_window_data(db, club, course, start_utc, end_utc)

        slot_state_count = seed_slot_states(
            db,
            club=club,
            course=course,
            tees_by_name=tees_by_name,
            start_date=start_date,
            end_date=end_date,
            operating_hours=operating_hours,
        )
        booking_count = seed_bookings(
            db,
            club=club,
            course=course,
            tees_by_name=tees_by_name,
            member_memberships=member_memberships,
            staff_memberships=staff_memberships,
            start_date=start_date,
            end_date=end_date,
            today=today,
        )
        db.commit()

    print(
        f"Seeded demo golf data for {DEV_CLUB_SLUG}: "
        f"1 course, {len(tees_by_name)} tees, {slot_state_count} slot states, {booking_count} bookings."
    )


def main() -> None:
    seed_demo_golf_data()


if __name__ == "__main__":
    main()
