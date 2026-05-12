"""KPI metrics + member-stats read model (member-stats service).

Verifies each implemented metric returns the expected aggregated value
for a seeded dataset, and that the new PeopleReadModelService produces
correct summary distributions, list_member_activity, and member_activity
shapes — with tenant isolation enforced.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    AccountCustomer,
    Booking,
    BookingParticipant,
    BookingParticipantType,
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
    FinanceTransaction,
    FinanceTransactionSource,
    FinanceTransactionType,
    Person,
    Tee,
    User,
)
from app.semantic import compute, get_metric
from app.services._window import TimeWindow
from app.services.people_read_model_service import PeopleReadModelService

WINDOW_DAY = date(2026, 7, 6)  # a Monday — operating hours apply
WINDOW_NEXT = date(2026, 7, 7)


def _seed_club(db: Session, *, slug: str, open_close: tuple[str, str] = ("06:00", "07:00")) -> Club:
    club = Club(name=f"KPI {slug}", slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    db.add(
        ClubConfig(
            club_id=club.id,
            timezone="Africa/Johannesburg",
            operating_hours={
                day: {"open": open_close[0], "close": open_close[1], "closed": False}
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
            default_slot_interval_minutes=30,
        )
    )
    db.commit()
    return club


def _seed_course_and_tee(db: Session, *, club: Club) -> tuple[Course, Tee]:
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


def _seed_user(db: Session, *, email: str, club: Club, joined_at: datetime | None = None) -> User:
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
            role=ClubMembershipRole.MEMBER,
            status=ClubMembershipStatus.ACTIVE,
            is_primary=True,
            joined_at=joined_at or datetime(2025, 1, 1, tzinfo=UTC),
        )
    )
    db.commit()
    db.refresh(user)
    return user


def _seed_finance_account(
    db: Session, *, club: Club, person: Person
) -> tuple[AccountCustomer, FinanceAccount]:
    customer = AccountCustomer(
        club_id=club.id,
        person_id=person.id,
        account_code=f"AC-{uuid.uuid4().hex[:8]}",
        active=True,
        billing_metadata={},
    )
    db.add(customer)
    db.flush()
    account = FinanceAccount(
        club_id=club.id,
        account_customer_id=customer.id,
        status=FinanceAccountStatus.ACTIVE,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return customer, account


def _seed_booking_with_charge(
    db: Session,
    *,
    club: Club,
    course: Course,
    tee: Tee,
    person: Person,
    account: FinanceAccount,
    slot_local_hour: int,
    status: BookingStatus,
    party_size: int = 2,
    fee_amount: Decimal = Decimal("325.00"),
) -> Booking:
    slot_utc = datetime(
        WINDOW_DAY.year, WINDOW_DAY.month, WINDOW_DAY.day, slot_local_hour - 2, 0, tzinfo=UTC
    )
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        tee_id=tee.id,
        slot_datetime=slot_utc,
        slot_interval_minutes=30,
        status=status,
        source=BookingSource.ADMIN,
        party_size=party_size,
        primary_person_id=person.id,
        fee_amount=fee_amount,
        fee_currency="ZAR",
    )
    db.add(booking)
    db.flush()
    db.add(
        BookingParticipant(
            booking_id=booking.id,
            person_id=person.id,
            participant_type=BookingParticipantType.MEMBER,
            display_name="Primary",
            sort_order=0,
            is_primary=True,
        )
    )
    db.add(
        FinanceTransaction(
            club_id=club.id,
            account_id=account.id,
            amount=-fee_amount,
            type=FinanceTransactionType.CHARGE,
            source=FinanceTransactionSource.BOOKING,
            reference_id=booking.id,
            description="Green fee",
            created_at=slot_utc,
        )
    )
    db.commit()
    db.refresh(booking)
    return booking


# ---------- PeopleReadModelService tests ---------------------------------


def test_member_stats_summary_buckets_by_role_status_and_tenure(db_session: Session) -> None:
    club = _seed_club(db_session, slug="member-summary")
    _seed_user(
        db_session,
        email="recent@example.com",
        club=club,
        joined_at=datetime(2026, 7, 1, tzinfo=UTC),  # under 1y at 2026-07-06
    )
    _seed_user(
        db_session,
        email="mid@example.com",
        club=club,
        joined_at=datetime(2023, 7, 1, tzinfo=UTC),  # ~3y
    )
    _seed_user(
        db_session,
        email="veteran@example.com",
        club=club,
        joined_at=datetime(2014, 1, 1, tzinfo=UTC),  # 10y+
    )
    service = PeopleReadModelService(db_session)
    result = service.summary(club_id=club.id, reference_date=WINDOW_DAY)
    assert result.total_members == 3
    assert result.by_role.get("member") == 3
    assert result.by_status.get("active") == 3
    assert result.by_tenure_bucket["under_1y"] == 1
    assert result.by_tenure_bucket["1_to_5y"] == 1
    assert result.by_tenure_bucket["10y_plus"] == 1
    assert result.average_tenure_days is not None and result.average_tenure_days > 0


def test_member_stats_summary_counts_growth_this_month(db_session: Session) -> None:
    club = _seed_club(db_session, slug="member-growth")
    _seed_user(
        db_session,
        email="new@example.com",
        club=club,
        joined_at=datetime(2026, 7, 2, tzinfo=UTC),
    )
    _seed_user(
        db_session,
        email="old@example.com",
        club=club,
        joined_at=datetime(2024, 1, 1, tzinfo=UTC),
    )
    service = PeopleReadModelService(db_session)
    result = service.summary(club_id=club.id, reference_date=WINDOW_DAY)
    assert result.growth_this_month == 1


def test_member_activity_returns_rounds_spend_and_last_played(db_session: Session) -> None:
    club = _seed_club(db_session, slug="member-activity")
    course, tee = _seed_course_and_tee(db_session, club=club)
    member = _seed_user(db_session, email="active@example.com", club=club)
    _, account = _seed_finance_account(db_session, club=club, person=member.person)
    _seed_booking_with_charge(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person=member.person,
        account=account,
        slot_local_hour=6,
        status=BookingStatus.COMPLETED,
        party_size=2,
        fee_amount=Decimal("325.00"),
    )
    service = PeopleReadModelService(db_session)
    activity = service.member_activity(club_id=club.id, person_id=member.person_id)
    assert activity.rounds == 1
    assert activity.spend == Decimal("325.00")
    assert activity.last_played == WINDOW_DAY


def test_list_member_activity_returns_one_entry_per_member(db_session: Session) -> None:
    club = _seed_club(db_session, slug="member-list")
    course, tee = _seed_course_and_tee(db_session, club=club)
    member_one = _seed_user(db_session, email="one@example.com", club=club)
    member_two = _seed_user(db_session, email="two@example.com", club=club)
    _, account_one = _seed_finance_account(db_session, club=club, person=member_one.person)
    _seed_booking_with_charge(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person=member_one.person,
        account=account_one,
        slot_local_hour=6,
        status=BookingStatus.COMPLETED,
        party_size=2,
        fee_amount=Decimal("400.00"),
    )
    service = PeopleReadModelService(db_session)
    entries = service.list_member_activity(club_id=club.id)
    assert len(entries) == 2
    by_person = {entry.person_id: entry for entry in entries}
    assert by_person[member_one.person_id].rounds == 1
    assert by_person[member_one.person_id].spend == Decimal("400.00")
    assert by_person[member_two.person_id].rounds == 0
    assert by_person[member_two.person_id].spend == Decimal("0.00")
    assert by_person[member_two.person_id].last_played is None


def test_member_activity_respects_window(db_session: Session) -> None:
    club = _seed_club(db_session, slug="member-window")
    course, tee = _seed_course_and_tee(db_session, club=club)
    member = _seed_user(db_session, email="window@example.com", club=club)
    _, account = _seed_finance_account(db_session, club=club, person=member.person)
    booking = _seed_booking_with_charge(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person=member.person,
        account=account,
        slot_local_hour=6,
        status=BookingStatus.COMPLETED,
        party_size=2,
        fee_amount=Decimal("300.00"),
    )
    service = PeopleReadModelService(db_session)
    # Window that excludes the seeded booking
    before_window = TimeWindow(
        club_id=club.id,
        timezone_name="Africa/Johannesburg",
        date_from=date(2026, 6, 1),
        date_to=date(2026, 6, 30),
        start_utc=datetime(2026, 6, 1, tzinfo=UTC),
        end_utc=datetime(2026, 6, 30, tzinfo=UTC),
    )
    bounded = service.member_activity(
        club_id=club.id, person_id=member.person_id, window=before_window
    )
    assert bounded.rounds == 0
    assert bounded.spend == Decimal("0.00")
    # Window that includes it
    inside_window = TimeWindow(
        club_id=club.id,
        timezone_name="Africa/Johannesburg",
        date_from=date(2026, 7, 1),
        date_to=date(2026, 7, 31),
        start_utc=datetime(2026, 7, 1, tzinfo=UTC),
        end_utc=datetime(2026, 7, 31, tzinfo=UTC),
    )
    inside = service.member_activity(
        club_id=club.id, person_id=member.person_id, window=inside_window
    )
    assert inside.rounds == 1
    assert inside.spend == Decimal("300.00")
    _ = booking  # silence unused


def test_member_stats_is_tenant_scoped(db_session: Session) -> None:
    """A summary for club A must not include club B's memberships."""
    club_a = _seed_club(db_session, slug="member-tenant-a")
    club_b = _seed_club(db_session, slug="member-tenant-b")
    _seed_user(db_session, email="a-only@example.com", club=club_a)
    _seed_user(db_session, email="b-only@example.com", club=club_b)
    service = PeopleReadModelService(db_session)
    summary_a = service.summary(club_id=club_a.id, reference_date=WINDOW_DAY)
    summary_b = service.summary(club_id=club_b.id, reference_date=WINDOW_DAY)
    assert summary_a.total_members == 1
    assert summary_b.total_members == 1
    list_a = service.list_member_activity(club_id=club_a.id)
    list_b = service.list_member_activity(club_id=club_b.id)
    assert {entry.person_id for entry in list_a} != {entry.person_id for entry in list_b}


def test_member_stats_registry_delegates_to_service(db_session: Session) -> None:
    """The 9F member_stats stub now returns real per-member entries."""
    club = _seed_club(db_session, slug="member-registry")
    course, tee = _seed_course_and_tee(db_session, club=club)
    member = _seed_user(db_session, email="registry@example.com", club=club)
    _, account = _seed_finance_account(db_session, club=club, person=member.person)
    _seed_booking_with_charge(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person=member.person,
        account=account,
        slot_local_hour=6,
        status=BookingStatus.COMPLETED,
        party_size=2,
        fee_amount=Decimal("250.00"),
    )
    result = compute("member_stats", db_session, club_id=club.id)
    assert len(result.members) == 1
    entry = result.members[0]
    assert entry.member_id == member.person_id
    assert entry.rounds == 1
    assert entry.spend == Decimal("250.00")


def test_member_stats_metric_contract_intact() -> None:
    """The 9F contract for member_stats stays exactly as registered."""
    metric = get_metric("member_stats")
    assert metric.version == "0.1.0"
    assert metric.owner == "greenlink-core"
    assert metric.dependencies == []
    assert metric.result_schema.__name__ == "MemberStatsResult"


# Silence unused-import noise for symbols that the seed helpers touch but
# don't return.
_ = timedelta
