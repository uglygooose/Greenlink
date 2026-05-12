"""KPI metrics + member-stats read model (RevPATT / RevPUR / EGF / F&B / weather).

Verifies each implemented metric returns the expected aggregated value
for a seeded dataset, and that the new PeopleReadModelService produces
correct summary distributions, list_member_activity, and member_activity
shapes — with tenant isolation enforced.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
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
    Order,
    OrderItem,
    OrderSource,
    OrderStatus,
    Person,
    PosTransaction,
    PosTransactionItem,
    Tee,
    TeeSheetSlotState,
    User,
    VatCategory,
)
from app.models.enums import TenderType
from app.semantic import compute

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


# ---------- KPI metric tests ---------------------------------------------


def test_revpatt_with_zero_data_is_zero(db_session: Session) -> None:
    club = _seed_club(db_session, slug="kpi-empty")
    _seed_course_and_tee(db_session, club=club)
    result = compute(
        "revpatt",
        db_session,
        club_id=club.id,
        date_from=WINDOW_DAY,
        date_to=WINDOW_NEXT,
    )
    assert result.value == Decimal("0.00")


def test_revpatt_divides_green_fee_revenue_by_generated_slots(db_session: Session) -> None:
    """Operating hours 06:00–07:00 in club tz = 60 min / 30 min interval = 2
    slots × 1 tee × 2 lanes = 4 generated slots/day. Revenue R650 over 4
    slots = R162.50.
    """
    club = _seed_club(db_session, slug="kpi-revpatt")
    course, tee = _seed_course_and_tee(db_session, club=club)
    member = _seed_user(db_session, email="revpatt-member@example.com", club=club)
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
        fee_amount=Decimal("650.00"),
    )
    result = compute(
        "revpatt",
        db_session,
        club_id=club.id,
        date_from=WINDOW_DAY,
        date_to=WINDOW_NEXT,
    )
    assert result.value == Decimal("162.50")


def test_revpatt_subtracts_blocked_slots_from_denominator(db_session: Session) -> None:
    """With 1 of 4 slots blocked, denominator drops to 3. R600/3 = R200."""
    club = _seed_club(db_session, slug="kpi-blocked")
    course, tee = _seed_course_and_tee(db_session, club=club)
    member = _seed_user(db_session, email="revpatt-blk@example.com", club=club)
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
        fee_amount=Decimal("600.00"),
    )
    blocked_slot_utc = datetime(
        WINDOW_DAY.year, WINDOW_DAY.month, WINDOW_DAY.day, 4, 30, tzinfo=UTC
    )
    db_session.add(
        TeeSheetSlotState(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=blocked_slot_utc,
            player_capacity=4,
            manually_blocked=True,
            blocked_reason="Maintenance",
        )
    )
    db_session.commit()
    result = compute(
        "revpatt",
        db_session,
        club_id=club.id,
        date_from=WINDOW_DAY,
        date_to=WINDOW_NEXT,
    )
    assert result.value == Decimal("200.00")


def test_revpur_divides_revenue_by_utilised_rounds(db_session: Session) -> None:
    """party_size sum = 4 (2 COMPLETED + 2 CHECKED_IN). Revenue R500.
    RevPUR = R125.00."""
    club = _seed_club(db_session, slug="kpi-revpur")
    course, tee = _seed_course_and_tee(db_session, club=club)
    member = _seed_user(db_session, email="revpur-m@example.com", club=club)
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
    _seed_booking_with_charge(
        db_session,
        club=club,
        course=course,
        tee=tee,
        person=member.person,
        account=account,
        slot_local_hour=7,
        status=BookingStatus.CHECKED_IN,
        party_size=2,
        fee_amount=Decimal("250.00"),
    )
    result = compute(
        "revpur",
        db_session,
        club_id=club.id,
        date_from=WINDOW_DAY,
        date_to=WINDOW_NEXT,
    )
    assert result.value == Decimal("125.00")


def test_revpur_excludes_no_show_and_cancelled_from_denominator(db_session: Session) -> None:
    """One COMPLETED party=2, one NO_SHOW party=4, one CANCELLED party=2.
    Only the COMPLETED booking's green-fee transaction posts revenue
    (RESERVED bookings don't auto-post — only post-charge does, which
    we simulate via the seeded FinanceTransaction). Denominator = 2."""
    club = _seed_club(db_session, slug="kpi-noshow")
    course, tee = _seed_course_and_tee(db_session, club=club)
    member = _seed_user(db_session, email="revpur-ns@example.com", club=club)
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
        fee_amount=Decimal("300.00"),
    )
    # No-show and cancelled bookings exist but emit no revenue and don't
    # count toward utilised rounds.
    db_session.add(
        Booking(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=datetime(
                WINDOW_DAY.year, WINDOW_DAY.month, WINDOW_DAY.day, 5, 0, tzinfo=UTC
            ),
            slot_interval_minutes=30,
            status=BookingStatus.NO_SHOW,
            source=BookingSource.ADMIN,
            party_size=4,
            primary_person_id=member.person_id,
        )
    )
    db_session.add(
        Booking(
            club_id=club.id,
            course_id=course.id,
            tee_id=tee.id,
            slot_datetime=datetime(
                WINDOW_DAY.year, WINDOW_DAY.month, WINDOW_DAY.day, 4, 30, tzinfo=UTC
            ),
            slot_interval_minutes=30,
            status=BookingStatus.CANCELLED,
            source=BookingSource.ADMIN,
            party_size=2,
            primary_person_id=member.person_id,
        )
    )
    db_session.commit()
    result = compute(
        "revpur",
        db_session,
        club_id=club.id,
        date_from=WINDOW_DAY,
        date_to=WINDOW_NEXT,
    )
    assert result.value == Decimal("150.00")  # 300 / 2


def test_effective_green_fee_matches_revpur_semantically(db_session: Session) -> None:
    """EGF and RevPUR are numerically identical; semantically distinct."""
    club = _seed_club(db_session, slug="kpi-egf")
    course, tee = _seed_course_and_tee(db_session, club=club)
    member = _seed_user(db_session, email="egf-m@example.com", club=club)
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
        party_size=4,
        fee_amount=Decimal("1200.00"),
    )
    egf = compute(
        "effective_green_fee",
        db_session,
        club_id=club.id,
        date_from=WINDOW_DAY,
        date_to=WINDOW_NEXT,
    )
    revpur = compute(
        "revpur",
        db_session,
        club_id=club.id,
        date_from=WINDOW_DAY,
        date_to=WINDOW_NEXT,
    )
    assert egf.value == Decimal("300.00")  # 1200 / 4
    assert egf.value == revpur.value


def test_fnb_per_round_includes_order_and_pos_branches(db_session: Session) -> None:
    """Player-app order F&B + POS F&B both count. Two utilised rounds."""
    club = _seed_club(db_session, slug="kpi-fnb")
    course, tee = _seed_course_and_tee(db_session, club=club)
    member = _seed_user(db_session, email="fnb-m@example.com", club=club)
    user_for_pos = _seed_user(db_session, email="fnb-pos@example.com", club=club)
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
        fee_amount=Decimal("400.00"),
    )
    # F&B via halfway-house order (player-app), status COLLECTED
    order = Order(
        club_id=club.id,
        person_id=member.person_id,
        source=OrderSource.PLAYER_APP,
        status=OrderStatus.COLLECTED,
        created_at=datetime(WINDOW_DAY.year, WINDOW_DAY.month, WINDOW_DAY.day, 5, 0, tzinfo=UTC),
    )
    db_session.add(order)
    db_session.flush()
    db_session.add(
        OrderItem(
            order_id=order.id,
            item_name_snapshot="Burger",
            unit_price_snapshot=Decimal("80.00"),
            quantity=1,
            vat_category=VatCategory.FNB.value,
        )
    )
    # F&B via POS line tagged FNB (explicitly — service default is 'other')
    pos_tx = PosTransaction(
        club_id=club.id,
        total_amount=Decimal("60.00"),
        tender_type=TenderType.CASH,
        created_by_user_id=user_for_pos.id,
        created_at=datetime(WINDOW_DAY.year, WINDOW_DAY.month, WINDOW_DAY.day, 5, 30, tzinfo=UTC),
    )
    db_session.add(pos_tx)
    db_session.flush()
    db_session.add(
        PosTransactionItem(
            pos_transaction_id=pos_tx.id,
            item_name_snapshot="Coffee",
            unit_price_snapshot=Decimal("30.00"),
            quantity=2,
            vat_category=VatCategory.FNB.value,
        )
    )
    db_session.commit()
    result = compute(
        "fnb_per_round",
        db_session,
        club_id=club.id,
        date_from=WINDOW_DAY,
        date_to=WINDOW_NEXT,
    )
    # (80 + 60) / 2 = 70.00
    assert result.value == Decimal("70.00")


def test_weather_adjusted_utilisation_remains_a_stub(db_session: Session) -> None:
    club = _seed_club(db_session, slug="kpi-weather")
    _seed_course_and_tee(db_session, club=club)
    result = compute(
        "weather_adjusted_utilisation",
        db_session,
        club_id=club.id,
        date_from=WINDOW_DAY,
        date_to=WINDOW_NEXT,
    )
    assert result.value == Decimal("0.00")


def test_kpi_metrics_are_tenant_scoped(db_session: Session) -> None:
    """Club A's revenue must not leak into club B's metrics."""
    club_a = _seed_club(db_session, slug="kpi-tenant-a")
    club_b = _seed_club(db_session, slug="kpi-tenant-b")
    course_a, tee_a = _seed_course_and_tee(db_session, club=club_a)
    _seed_course_and_tee(db_session, club=club_b)
    member_a = _seed_user(db_session, email="kpi-tenant-a@example.com", club=club_a)
    _, account_a = _seed_finance_account(db_session, club=club_a, person=member_a.person)
    _seed_booking_with_charge(
        db_session,
        club=club_a,
        course=course_a,
        tee=tee_a,
        person=member_a.person,
        account=account_a,
        slot_local_hour=6,
        status=BookingStatus.COMPLETED,
        fee_amount=Decimal("500.00"),
    )
    a_revpur = compute(
        "revpur", db_session, club_id=club_a.id, date_from=WINDOW_DAY, date_to=WINDOW_NEXT
    )
    b_revpur = compute(
        "revpur", db_session, club_id=club_b.id, date_from=WINDOW_DAY, date_to=WINDOW_NEXT
    )
    assert a_revpur.value == Decimal("250.00")  # 500 / 2
    assert b_revpur.value == Decimal("0.00")
