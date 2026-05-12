"""Audit-log coverage matrix (finance services).

One test per registered emission across the booking lifecycle, finance, and settings services. Each test invokes the
service method directly with minimal fixtures, then asserts the matching
DomainEventRecord row exists via the conftest helper.

Snapshot assertions check structural presence (the right keys), not value
equality — value comparison is brittle and a separate concern.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.events.emission_context import EmissionContext
from app.models import (
    AccountCustomer,
    Booking,
    BookingPaymentStatus,
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
    FinanceExportProfile,
    FinanceTransactionSource,
    FinanceTransactionType,
    Order,
    OrderItem,
    OrderSource,
    OrderStatus,
    Person,
    Tee,
    User,
)
from app.schemas.finance import (
    AccountingExportProfileMappingConfig,
    AccountingExportProfileTransactionMapping,
    AccountingExportProfileUpsertRequest,
    FinanceExportBatchCreateRequest,
    FinanceTransactionCreateRequest,
)
from app.schemas.orders import OrderChargePostRequest
from app.services.finance.accounting_profile_mapping_service import (
    AccountingProfileMappingService,
)
from app.services.finance.export_batch_service import FinanceExportBatchService
from app.services.finance.ledger_service import LedgerService
from app.services.order_finance_posting_service import OrderFinancePostingService
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


# ---------- Finance ------------------------------------------------------


def test_finance_transaction_posted_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="fin-tx@example.com")
    club = _create_club(db_session, slug="fin-tx")
    _, account = _seed_finance_account(db_session, club=club, person=user.person)

    result = LedgerService(db_session).create_transaction(
        club_id=club.id,
        payload=FinanceTransactionCreateRequest(
            account_id=account.id,
            amount=Decimal("-125.00"),
            type=FinanceTransactionType.CHARGE,
            source=FinanceTransactionSource.MANUAL,
            description="Manual charge",
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    assert_event_emitted(
        db_session,
        entity_type="finance_transaction",
        entity_id=str(result.transaction.id),
        action="finance.transaction.posted",
    )


def _seed_finance_transactions_for_export(
    db: Session, *, club: Club, account: FinanceAccount, day: date
) -> None:
    from app.models import FinanceTransaction

    db.add(
        FinanceTransaction(
            club_id=club.id,
            account_id=account.id,
            amount=Decimal("-250.00"),
            type=FinanceTransactionType.CHARGE,
            source=FinanceTransactionSource.BOOKING,
            reference_id=None,
            description="Seeded charge",
            created_at=datetime.combine(day, datetime.min.time(), tzinfo=UTC) + timedelta(hours=8),
        )
    )
    db.commit()


def test_finance_export_batch_generated_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="fin-eg@example.com")
    club = _create_club(db_session, slug="fin-eg")
    _, account = _seed_finance_account(db_session, club=club, person=user.person)
    target_day = date(2026, 6, 1)
    _seed_finance_transactions_for_export(db_session, club=club, account=account, day=target_day)

    result = FinanceExportBatchService(db_session).generate_or_get_existing(
        club_id=club.id,
        created_by_person_id=user.person_id,
        payload=FinanceExportBatchCreateRequest(
            export_profile=FinanceExportProfile.JOURNAL_BASIC,
            date_from=target_day,
            date_to=target_day,
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    assert result.created
    assert_event_emitted(
        db_session,
        entity_type="finance_export_batch",
        entity_id=str(result.batch.id),
        action="finance.export_batch.generated",
    )


def test_finance_export_batch_voided_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="fin-ev@example.com")
    club = _create_club(db_session, slug="fin-ev")
    _, account = _seed_finance_account(db_session, club=club, person=user.person)
    target_day = date(2026, 6, 2)
    _seed_finance_transactions_for_export(db_session, club=club, account=account, day=target_day)
    service = FinanceExportBatchService(db_session)
    created = service.generate_or_get_existing(
        club_id=club.id,
        created_by_person_id=user.person_id,
        payload=FinanceExportBatchCreateRequest(
            export_profile=FinanceExportProfile.JOURNAL_BASIC,
            date_from=target_day,
            date_to=target_day,
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    service.void_batch(
        club_id=club.id, batch_id=created.batch.id, context=EmissionContext(actor_user_id=user.id)
    )
    assert_event_emitted(
        db_session,
        entity_type="finance_export_batch",
        entity_id=str(created.batch.id),
        action="finance.export_batch.voided",
    )


def test_finance_export_batch_regenerated_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="fin-er@example.com")
    club = _create_club(db_session, slug="fin-er")
    _, account = _seed_finance_account(db_session, club=club, person=user.person)
    target_day = date(2026, 6, 3)
    _seed_finance_transactions_for_export(db_session, club=club, account=account, day=target_day)
    service = FinanceExportBatchService(db_session)
    created = service.generate_or_get_existing(
        club_id=club.id,
        created_by_person_id=user.person_id,
        payload=FinanceExportBatchCreateRequest(
            export_profile=FinanceExportProfile.JOURNAL_BASIC,
            date_from=target_day,
            date_to=target_day,
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    service.regenerate_batch(
        club_id=club.id,
        batch_id=created.batch.id,
        regenerated_by_person_id=user.person_id,
        context=EmissionContext(actor_user_id=user.id),
    )
    assert_event_emitted(
        db_session,
        entity_type="finance_export_batch",
        entity_id=str(created.batch.id),
        action="finance.export_batch.regenerated",
    )


def _accounting_profile_payload(
    *, code: str = "ACT-01", name: str = "Active"
) -> AccountingExportProfileUpsertRequest:
    mapping = AccountingExportProfileTransactionMapping(
        debit_account_code="1000-DEBIT",
        credit_account_code="2000-CREDIT",
        description_prefix="GL",
    )
    return AccountingExportProfileUpsertRequest(
        code=code,
        name=name,
        target_system="generic_journal",
        is_active=True,
        mapping_config=AccountingExportProfileMappingConfig(
            transaction_mappings={
                FinanceTransactionType.CHARGE: mapping,
                FinanceTransactionType.PAYMENT: mapping,
                FinanceTransactionType.ADJUSTMENT: mapping,
                FinanceTransactionType.REFUND: mapping,
            },
        ),
    )


def test_finance_profile_created_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="fin-pc@example.com")
    club = _create_club(db_session, slug="fin-pc")
    profile = AccountingProfileMappingService(db_session).create_profile(
        club_id=club.id,
        created_by_person_id=user.person_id,
        payload=_accounting_profile_payload(),
        context=EmissionContext(actor_user_id=user.id),
    )
    assert_event_emitted(
        db_session,
        entity_type="accounting_profile",
        entity_id=str(profile.id),
        action="finance.profile.created",
    )


def test_finance_profile_updated_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="fin-pu@example.com")
    club = _create_club(db_session, slug="fin-pu")
    service = AccountingProfileMappingService(db_session)
    profile = service.create_profile(
        club_id=club.id,
        created_by_person_id=user.person_id,
        payload=_accounting_profile_payload(code="UPD-01", name="Original"),
        context=EmissionContext(actor_user_id=user.id),
    )
    service.update_profile(
        club_id=club.id,
        profile_id=profile.id,
        payload=_accounting_profile_payload(code="UPD-01", name="Renamed"),
        context=EmissionContext(actor_user_id=user.id),
        actor_person_id=user.person_id,
    )
    assert_event_emitted(
        db_session,
        entity_type="accounting_profile",
        entity_id=str(profile.id),
        action="finance.profile.updated",
    )


def test_finance_export_batch_exported_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="fin-em@example.com")
    club = _create_club(db_session, slug="fin-em")
    _, account = _seed_finance_account(db_session, club=club, person=user.person)
    target_day = date(2026, 6, 4)
    _seed_finance_transactions_for_export(db_session, club=club, account=account, day=target_day)
    batch_service = FinanceExportBatchService(db_session)
    created = batch_service.generate_or_get_existing(
        club_id=club.id,
        created_by_person_id=user.person_id,
        payload=FinanceExportBatchCreateRequest(
            export_profile=FinanceExportProfile.JOURNAL_BASIC,
            date_from=target_day,
            date_to=target_day,
        ),
        context=EmissionContext(actor_user_id=user.id),
    )
    profile_service = AccountingProfileMappingService(db_session)
    profile = profile_service.create_profile(
        club_id=club.id,
        created_by_person_id=user.person_id,
        payload=_accounting_profile_payload(code="EXP-01", name="ExportTarget"),
        context=EmissionContext(actor_user_id=user.id),
    )
    profile_service.export_mapped_batch(
        club_id=club.id,
        batch_id=created.batch.id,
        profile_id=profile.id,
        exported_by_person_id=user.person_id,
        context=EmissionContext(actor_user_id=user.id),
    )
    assert_event_emitted(
        db_session,
        entity_type="finance_export_batch",
        entity_id=str(created.batch.id),
        action="finance.export_batch.exported",
    )


def test_finance_order_charge_posted_emits_event(db_session: Session) -> None:
    user = _create_user(db_session, email="fin-oc@example.com")
    club = _create_club(db_session, slug="fin-oc")
    _assign_membership(db_session, person_id=user.person_id, club_id=club.id)
    _, _ = _seed_finance_account(db_session, club=club, person=user.person)

    order = Order(
        club_id=club.id,
        person_id=user.person_id,
        source=OrderSource.STAFF,
        status=OrderStatus.COLLECTED,
    )
    db_session.add(order)
    db_session.flush()
    db_session.add(
        OrderItem(
            order_id=order.id,
            item_name_snapshot="Burger",
            unit_price_snapshot=Decimal("68.00"),
            quantity=1,
        )
    )
    db_session.commit()

    OrderFinancePostingService(db_session).post_charge(
        club_id=club.id,
        payload=OrderChargePostRequest(order_id=order.id, acting_user_id=user.id),
        context=EmissionContext(actor_user_id=user.id),
    )
    assert_event_emitted(
        db_session,
        entity_type="finance_order_charge",
        entity_id=str(order.id),
        action="finance.order_charge.posted",
    )
