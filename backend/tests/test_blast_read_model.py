"""Phase 9E WI-12 — blast read model.

Covers BlastReadModelService.summary + list_recent plus tenant
isolation, window bounds, empty-club behaviour, and the
``list_blasts`` ``.query()`` → ``select()`` conversion regression
guard (the service still returns the same shape after the
rewrite).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    BlastChannel,
    BlastStatus,
    BlastTargetSegment,
    Club,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Person,
    User,
)
from app.models.communication_blast import CommunicationBlast
from app.schemas.blasts import BlastCreateRequest
from app.services.comms.blast_read_model_service import BlastReadModelService
from app.services.comms.blast_service import BlastService


def _create_club(db: Session, *, slug: str) -> Club:
    club = Club(name=f"Comms {slug}", slug=slug, timezone="Africa/Johannesburg")
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


def _create_user(
    db: Session, *, email: str, club: Club, role: ClubMembershipRole = ClubMembershipRole.CLUB_ADMIN
) -> User:
    local = email.split("@")[0]
    person = Person(
        first_name=local.title(),
        last_name="Comms",
        full_name=build_full_name(local.title(), "Comms"),
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


def _create_blast(
    db: Session,
    *,
    club: Club,
    status: BlastStatus,
    created_at: datetime,
    recipient_count: int | None = None,
    sent_at: datetime | None = None,
    subject: str = "Test",
    created_by_person_id: uuid.UUID | None = None,
) -> CommunicationBlast:
    blast = CommunicationBlast(
        club_id=club.id,
        created_by_person_id=created_by_person_id,
        subject=subject,
        body="body",
        target_segment=BlastTargetSegment.ALL,
        channel=BlastChannel.IN_APP,
        status=status,
        recipient_count=recipient_count,
        sent_at=sent_at,
        created_at=created_at,
    )
    db.add(blast)
    db.commit()
    db.refresh(blast)
    return blast


# ---------- BlastReadModelService.summary --------------------------------


def test_summary_for_empty_club_returns_zeroes(db_session: Session) -> None:
    club = _create_club(db_session, slug="comms-empty")
    result = BlastReadModelService(db_session).summary(club_id=club.id)
    assert result.total_blasts == 0
    assert result.blasts_drafted == 0
    assert result.blasts_sent == 0
    assert result.blasts_failed == 0
    assert result.average_target_size == 0
    assert result.last_sent_at is None


def test_summary_groups_blasts_by_lifecycle_state(db_session: Session) -> None:
    club = _create_club(db_session, slug="comms-by-state")
    base = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    _create_blast(db_session, club=club, status=BlastStatus.DRAFT, created_at=base)
    _create_blast(
        db_session,
        club=club,
        status=BlastStatus.SENT,
        created_at=base,
        recipient_count=10,
        sent_at=base,
    )
    _create_blast(
        db_session,
        club=club,
        status=BlastStatus.SENT,
        created_at=base,
        recipient_count=30,
        sent_at=base,
    )
    _create_blast(db_session, club=club, status=BlastStatus.FAILED, created_at=base)
    result = BlastReadModelService(db_session).summary(club_id=club.id)
    assert result.total_blasts == 4
    assert result.blasts_drafted == 1
    assert result.blasts_sent == 2
    assert result.blasts_failed == 1
    # Average across SENT blasts only: (10 + 30) / 2 = 20
    assert result.average_target_size == 20


def test_summary_reports_last_sent_at(db_session: Session) -> None:
    club = _create_club(db_session, slug="comms-last-sent")
    earlier = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    later = datetime(2026, 7, 5, 18, 30, tzinfo=UTC)
    _create_blast(
        db_session,
        club=club,
        status=BlastStatus.SENT,
        created_at=earlier,
        sent_at=earlier,
        recipient_count=5,
    )
    _create_blast(
        db_session,
        club=club,
        status=BlastStatus.SENT,
        created_at=later,
        sent_at=later,
        recipient_count=7,
    )
    result = BlastReadModelService(db_session).summary(club_id=club.id)
    assert result.last_sent_at == later


def test_summary_window_filters_by_created_at(db_session: Session) -> None:
    club = _create_club(db_session, slug="comms-window")
    in_window = datetime(2026, 7, 10, 8, 0, tzinfo=UTC)
    out_window = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
    _create_blast(
        db_session,
        club=club,
        status=BlastStatus.SENT,
        created_at=in_window,
        sent_at=in_window,
        recipient_count=4,
    )
    _create_blast(
        db_session,
        club=club,
        status=BlastStatus.SENT,
        created_at=out_window,
        sent_at=out_window,
        recipient_count=100,
    )
    service = BlastReadModelService(db_session)
    bounded = service.summary(
        club_id=club.id,
        start_utc=datetime(2026, 7, 1, tzinfo=UTC),
        end_utc=datetime(2026, 7, 31, tzinfo=UTC),
    )
    assert bounded.total_blasts == 1
    assert bounded.blasts_sent == 1
    assert bounded.average_target_size == 4
    unbounded = service.summary(club_id=club.id)
    assert unbounded.total_blasts == 2
    assert unbounded.average_target_size == 52  # (4 + 100) / 2


def test_summary_is_tenant_scoped(db_session: Session) -> None:
    club_a = _create_club(db_session, slug="comms-tenant-a")
    club_b = _create_club(db_session, slug="comms-tenant-b")
    base = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    _create_blast(
        db_session,
        club=club_b,
        status=BlastStatus.SENT,
        created_at=base,
        sent_at=base,
        recipient_count=50,
    )
    service = BlastReadModelService(db_session)
    a_summary = service.summary(club_id=club_a.id)
    b_summary = service.summary(club_id=club_b.id)
    assert a_summary.total_blasts == 0
    assert b_summary.total_blasts == 1


# ---------- BlastReadModelService.list_recent -----------------------------


def test_list_recent_orders_newest_first_and_honours_limit(db_session: Session) -> None:
    club = _create_club(db_session, slug="comms-list")
    older = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    middle = datetime(2026, 7, 3, 12, 0, tzinfo=UTC)
    newest = datetime(2026, 7, 5, 12, 0, tzinfo=UTC)
    _create_blast(db_session, club=club, status=BlastStatus.DRAFT, created_at=older, subject="old")
    _create_blast(db_session, club=club, status=BlastStatus.DRAFT, created_at=middle, subject="mid")
    _create_blast(db_session, club=club, status=BlastStatus.DRAFT, created_at=newest, subject="new")
    items = BlastReadModelService(db_session).list_recent(club_id=club.id, limit=2)
    assert len(items) == 2
    assert [item.subject for item in items] == ["new", "mid"]


def test_list_recent_is_tenant_scoped(db_session: Session) -> None:
    club_a = _create_club(db_session, slug="comms-list-a")
    club_b = _create_club(db_session, slug="comms-list-b")
    base = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)
    _create_blast(
        db_session, club=club_b, status=BlastStatus.DRAFT, created_at=base, subject="b-only"
    )
    items = BlastReadModelService(db_session).list_recent(club_id=club_a.id)
    assert items == []


def test_list_recent_response_shape_is_fully_populated(db_session: Session) -> None:
    club = _create_club(db_session, slug="comms-shape")
    admin = _create_user(db_session, email="comms-shape@example.com", club=club)
    sent_at = datetime(2026, 7, 4, 9, 0, tzinfo=UTC)
    _create_blast(
        db_session,
        club=club,
        status=BlastStatus.SENT,
        created_at=sent_at,
        sent_at=sent_at,
        recipient_count=12,
        subject="weekly",
        created_by_person_id=admin.person_id,
    )
    items = BlastReadModelService(db_session).list_recent(club_id=club.id)
    assert len(items) == 1
    item = items[0]
    assert item.subject == "weekly"
    assert item.status == BlastStatus.SENT
    assert item.recipient_count == 12
    assert item.sent_at == sent_at
    assert item.created_by_person_id == admin.person_id


# ---------- .query() → select() conversion regression --------------------


def test_list_blasts_still_returns_descending_order(db_session: Session) -> None:
    """Phase 9E opportunistic cleanup of audit Finding 4.4: blast_service.py
    list_blasts now uses ``select(...)`` instead of ``.query(...)``. This
    test guards the shape stays identical — three blasts in, three out,
    newest first, ``total_count`` matching.
    """
    club = _create_club(db_session, slug="comms-list-shape")
    admin = _create_user(db_session, email="comms-list-shape@example.com", club=club)
    oldest = datetime(2026, 1, 5, 8, 0, tzinfo=UTC)
    middle = datetime(2026, 3, 12, 8, 0, tzinfo=UTC)
    newest = datetime(2026, 7, 4, 8, 0, tzinfo=UTC)
    _create_blast(
        db_session,
        club=club,
        status=BlastStatus.DRAFT,
        created_at=oldest,
        subject="oldest",
        created_by_person_id=admin.person_id,
    )
    _create_blast(
        db_session,
        club=club,
        status=BlastStatus.DRAFT,
        created_at=middle,
        subject="middle",
        created_by_person_id=admin.person_id,
    )
    _create_blast(
        db_session,
        club=club,
        status=BlastStatus.DRAFT,
        created_at=newest,
        subject="newest",
        created_by_person_id=admin.person_id,
    )
    result = BlastService(db_session).list_blasts(club.id)
    subjects = [blast.subject for blast in result.blasts]
    assert subjects == ["newest", "middle", "oldest"]
    assert result.total_count == 3


def test_create_blast_write_path_remains_intact(db_session: Session) -> None:
    """Confirm BlastService.create_blast still produces a row that the
    rewritten list_blasts can return.
    """
    club = _create_club(db_session, slug="comms-list-write")
    admin = _create_user(db_session, email="comms-list-write@example.com", club=club)
    created = BlastService(db_session).create_blast(
        club_id=club.id,
        created_by_person_id=admin.person_id,
        payload=BlastCreateRequest(
            subject="hello",
            body="body",
            target_segment=BlastTargetSegment.ALL,
            channel=BlastChannel.IN_APP,
        ),
    )
    db_session.commit()
    listing = BlastService(db_session).list_blasts(club.id)
    assert listing.total_count == 1
    assert listing.blasts[0].id == created.id
    assert listing.blasts[0].subject == "hello"
