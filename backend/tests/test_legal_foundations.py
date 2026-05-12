from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Booking,
    BookingStatus,
    Club,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    ConsentSource,
    Course,
    DomainEventRecord,
    Order,
    OrderItem,
    OrderSource,
    OrderStatus,
    Person,
    PosTransaction,
    PosTransactionItem,
    User,
    VatCategory,
)
from app.models.enums import TenderType
from app.schemas.people import PersonCreateRequest, PersonUpdateRequest
from app.schemas.pos import PosTransactionCreateRequest, PosTransactionItemInput
from app.services.golf_settings_service import GolfSettingsService
from app.services.people_service import PeopleService
from app.services.pos_service import PosService


def _create_club(db: Session, *, name: str = "Phase 9A Club", slug: str = "phase-9a") -> Club:
    club = Club(name=name, slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _create_person(db: Session, *, email: str = "p@example.com") -> Person:
    person = Person(
        first_name="Pat",
        last_name="Person",
        full_name=build_full_name("Pat", "Person"),
        email=normalize_email(email),
        normalized_email=normalize_email(email),
        profile_metadata={},
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


def _create_user(db: Session, *, email: str = "u@example.com") -> User:
    person = _create_person(db, email=email)
    user = User(
        email=email,
        password_hash=hash_password("password123"),
        display_name="User",
        person_id=person.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


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


# ---------- POPIA consent capture ----------------------------------------


def test_create_person_captures_consent_fields(db_session: Session) -> None:
    service = PeopleService(db_session)
    captured_at = datetime(2026, 5, 12, 9, 0, tzinfo=UTC)
    person = service.create_person(
        PersonCreateRequest(
            first_name="Sam",
            last_name="Member",
            email="sam@example.com",
            consent_captured_at=captured_at,
            consent_version="2026-05-01",
            consent_source=ConsentSource.ONBOARDING,
        )
    )
    assert person.consent_captured_at == captured_at
    assert person.consent_version == "2026-05-01"
    assert person.consent_source == ConsentSource.ONBOARDING.value


def test_update_person_can_record_consent(db_session: Session) -> None:
    service = PeopleService(db_session)
    person = service.create_person(
        PersonCreateRequest(first_name="No", last_name="Consent", email="nc@example.com")
    )
    assert person.consent_captured_at is None
    captured_at = datetime(2026, 5, 12, 12, 0, tzinfo=UTC)
    updated = service.update_person(
        person,
        PersonUpdateRequest(
            consent_captured_at=captured_at,
            consent_version="2026-05-01",
            consent_source=ConsentSource.ADMIN_CAPTURE,
        ),
    )
    assert updated.consent_captured_at == captured_at
    assert updated.consent_source == ConsentSource.ADMIN_CAPTURE.value


# ---------- HNA Player ID -------------------------------------------------


def test_create_person_stores_hna_player_id(db_session: Session) -> None:
    service = PeopleService(db_session)
    person = service.create_person(
        PersonCreateRequest(
            first_name="Hana",
            last_name="Golfer",
            email="hana@example.com",
            hna_player_id="HNA-12345",
        )
    )
    assert person.hna_player_id == "HNA-12345"


def test_hna_player_id_is_globally_unique(db_session: Session) -> None:
    service = PeopleService(db_session)
    service.create_person(
        PersonCreateRequest(first_name="A", last_name="One", email="a@x.com", hna_player_id="DUP-1")
    )
    with pytest.raises(IntegrityError):
        service.create_person(
            PersonCreateRequest(
                first_name="B", last_name="Two", email="b@x.com", hna_player_id="DUP-1"
            )
        )
    db_session.rollback()


def test_hna_player_id_nulls_are_not_constrained(db_session: Session) -> None:
    service = PeopleService(db_session)
    a = service.create_person(
        PersonCreateRequest(first_name="A", last_name="Null", email="anull@x.com")
    )
    b = service.create_person(
        PersonCreateRequest(first_name="B", last_name="Null", email="bnull@x.com")
    )
    assert a.hna_player_id is None
    assert b.hna_player_id is None


# ---------- POPIA Information Officer ------------------------------------


def test_designate_information_officer_records_state_and_event(db_session: Session) -> None:
    club = _create_club(db_session)
    person = _create_person(db_session, email="io@example.com")
    _assign_membership(db_session, person_id=person.id, club_id=club.id)
    service = GolfSettingsService(db_session)

    result = service.designate_information_officer(club_id=club.id, person_id=person.id)
    assert result.club_id == club.id
    assert result.person_id == person.id
    assert result.designated_at is not None

    reloaded = db_session.get(Club, club.id)
    assert reloaded is not None
    assert reloaded.information_officer_person_id == person.id
    assert reloaded.information_officer_designated_at is not None

    event = db_session.scalar(
        select(DomainEventRecord).where(
            DomainEventRecord.event_type == "information_officer.designated",
            DomainEventRecord.club_id == club.id,
        )
    )
    assert event is not None
    assert event.payload["person_id"] == str(person.id)


def test_clear_information_officer_emits_event_and_nulls_fields(db_session: Session) -> None:
    club = _create_club(db_session)
    person = _create_person(db_session, email="io2@example.com")
    _assign_membership(db_session, person_id=person.id, club_id=club.id)
    service = GolfSettingsService(db_session)
    service.designate_information_officer(club_id=club.id, person_id=person.id)

    cleared = service.clear_information_officer(club_id=club.id)
    assert cleared.person_id is None
    assert cleared.designated_at is None

    reloaded = db_session.get(Club, club.id)
    assert reloaded is not None
    assert reloaded.information_officer_person_id is None

    event = db_session.scalar(
        select(DomainEventRecord).where(
            DomainEventRecord.event_type == "information_officer.cleared",
            DomainEventRecord.club_id == club.id,
        )
    )
    assert event is not None
    assert event.payload["previous_person_id"] == str(person.id)


def test_designate_information_officer_rejects_non_member(db_session: Session) -> None:
    club = _create_club(db_session)
    outsider = _create_person(db_session, email="outsider@example.com")
    service = GolfSettingsService(db_session)
    with pytest.raises(ConflictError):
        service.designate_information_officer(club_id=club.id, person_id=outsider.id)


def test_designate_information_officer_rejects_unknown_person(db_session: Session) -> None:
    club = _create_club(db_session)
    service = GolfSettingsService(db_session)
    with pytest.raises(NotFoundError):
        service.designate_information_officer(club_id=club.id, person_id=uuid.uuid4())


# ---------- VAT category --------------------------------------------------


def test_booking_default_vat_category_is_green_fee(db_session: Session) -> None:
    club = _create_club(db_session, slug="vat-club")
    course = Course(club_id=club.id, name="Course A", holes=18)
    db_session.add(course)
    db_session.commit()

    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        slot_datetime=datetime(2026, 5, 13, 6, 0, tzinfo=UTC),
        slot_interval_minutes=10,
        status=BookingStatus.RESERVED,
        party_size=1,
    )
    db_session.add(booking)
    db_session.commit()
    db_session.refresh(booking)
    assert booking.vat_category == VatCategory.GREEN_FEE.value


def test_pos_transaction_items_default_vat_category_is_other(db_session: Session) -> None:
    club = _create_club(db_session, slug="pos-vat-club")
    user = _create_user(db_session, email="pos@example.com")
    service = PosService(db_session)
    result = service.create_transaction(
        club_id=club.id,
        payload=PosTransactionCreateRequest(
            tender_type=TenderType.CASH,
            person_id=None,
            items=[
                PosTransactionItemInput(
                    product_id=None,
                    item_name="Bottled water",
                    unit_price=Decimal("12.00"),
                    quantity=1,
                )
            ],
        ),
        actor_user_id=user.id,
    )
    assert result.decision == "allowed"
    items = db_session.scalars(select(PosTransactionItem)).all()
    assert items
    assert all(item.vat_category == VatCategory.OTHER.value for item in items)


def test_order_items_inserted_directly_get_vat_category_default(db_session: Session) -> None:
    club = _create_club(db_session, slug="orders-vat")
    person = _create_person(db_session, email="orderp@example.com")
    _assign_membership(db_session, person_id=person.id, club_id=club.id)

    order = Order(
        club_id=club.id,
        person_id=person.id,
        source=OrderSource.STAFF,
        status=OrderStatus.PLACED,
    )
    db_session.add(order)
    db_session.flush()
    db_session.add(
        OrderItem(
            order_id=order.id,
            product_id=None,
            item_name_snapshot="Pro shop towel",
            unit_price_snapshot=Decimal("120.00"),
            quantity=1,
        )
    )
    db_session.commit()
    item = db_session.scalar(select(OrderItem).where(OrderItem.order_id == order.id))
    assert item is not None
    assert item.vat_category == VatCategory.OTHER.value


def test_vat_category_rejects_unknown_value(db_session: Session) -> None:
    club = _create_club(db_session, slug="vat-bad")
    course = Course(club_id=club.id, name="C", holes=18)
    db_session.add(course)
    db_session.commit()
    booking = Booking(
        club_id=club.id,
        course_id=course.id,
        slot_datetime=datetime(2026, 5, 13, 6, 0, tzinfo=UTC),
        slot_interval_minutes=10,
        status=BookingStatus.RESERVED,
        party_size=1,
        vat_category="not_a_real_category",
    )
    db_session.add(booking)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_pos_transaction_item_vat_category_rejects_unknown_value(db_session: Session) -> None:
    club = _create_club(db_session, slug="pos-vat-bad")
    user = _create_user(db_session, email="posbad@example.com")
    pos_tx = PosTransaction(
        club_id=club.id,
        total_amount=Decimal("10.00"),
        tender_type=TenderType.CASH,
        created_by_user_id=user.id,
    )
    db_session.add(pos_tx)
    db_session.flush()
    db_session.add(
        PosTransactionItem(
            pos_transaction_id=pos_tx.id,
            product_id=None,
            item_name_snapshot="Bad",
            unit_price_snapshot=Decimal("10.00"),
            quantity=1,
            vat_category="not_a_real_category",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
