from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.club_membership import ClubMembership
from app.models.communication_blast import CommunicationBlast
from app.models.enums import (
    BlastChannel,
    BlastStatus,
    BlastTargetSegment,
    ClubMembershipRole,
    ClubMembershipStatus,
)
from app.models.person import Person
from app.schemas.blasts import (
    BlastAuthorResponse,
    BlastCreateRequest,
    BlastListResponse,
    BlastResponse,
    BlastSendResponse,
)

_log = logging.getLogger(__name__)


def _to_response(blast: CommunicationBlast) -> BlastResponse:
    created_by: BlastAuthorResponse | None = None
    if blast.created_by is not None:
        created_by = BlastAuthorResponse(
            person_id=blast.created_by.id,
            full_name=blast.created_by.full_name,
        )
    return BlastResponse(
        id=blast.id,
        club_id=blast.club_id,
        subject=blast.subject,
        body=blast.body,
        target_segment=blast.target_segment,
        channel=blast.channel,
        status=blast.status,
        scheduled_at=blast.scheduled_at,
        sent_at=blast.sent_at,
        recipient_count=blast.recipient_count,
        delivery_note=blast.delivery_note,
        created_at=blast.created_at,
        updated_at=blast.updated_at,
        created_by=created_by,
    )


class BlastService:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_blasts(self, club_id: uuid.UUID) -> BlastListResponse:
        blasts = list(
            self._db.scalars(
                select(CommunicationBlast)
                .where(CommunicationBlast.club_id == club_id)
                .order_by(CommunicationBlast.created_at.desc())
            ).all()
        )
        return BlastListResponse(
            blasts=[_to_response(b) for b in blasts],
            total_count=len(blasts),
        )

    def create_blast(
        self,
        club_id: uuid.UUID,
        created_by_person_id: uuid.UUID | None,
        payload: BlastCreateRequest,
    ) -> BlastResponse:
        blast = CommunicationBlast(
            club_id=club_id,
            created_by_person_id=created_by_person_id,
            subject=payload.subject.strip(),
            body=payload.body.strip(),
            target_segment=payload.target_segment,
            channel=payload.channel,
            status=BlastStatus.DRAFT,
        )
        self._db.add(blast)
        self._db.flush()
        self._db.refresh(blast)
        return _to_response(blast)

    def send_blast(self, club_id: uuid.UUID, blast_id: uuid.UUID) -> BlastSendResponse:
        blast = (
            self._db.query(CommunicationBlast)
            .filter(CommunicationBlast.id == blast_id, CommunicationBlast.club_id == club_id)
            .first()
        )
        if blast is None:
            from app.core.exceptions import NotFoundError

            raise NotFoundError("Blast not found")

        recipients = self._resolve_recipients(club_id, blast.target_segment)
        recipient_count = len(recipients)

        if blast.channel == BlastChannel.EMAIL:
            note = self._attempt_email_delivery(blast, recipients)
        else:
            note = (
                f"In-app blast logged for {recipient_count} recipient(s). "
                "In-app delivery surface is a future evolution item."
            )
            _log.info(
                "In-app blast id=%s club=%s segment=%s recipients=%d",
                blast.id,
                club_id,
                blast.target_segment,
                recipient_count,
            )

        blast.status = BlastStatus.SENT
        blast.sent_at = datetime.now(UTC)
        blast.recipient_count = recipient_count
        blast.delivery_note = note
        self._db.flush()

        return BlastSendResponse(
            id=blast.id,
            status=blast.status,
            recipient_count=recipient_count,
            delivery_note=note,
        )

    def _resolve_recipients(self, club_id: uuid.UUID, segment: BlastTargetSegment) -> list[Person]:
        role_filter: list[ClubMembershipRole] = []
        if segment == BlastTargetSegment.ALL:
            role_filter = [
                ClubMembershipRole.MEMBER,
                ClubMembershipRole.CLUB_STAFF,
                ClubMembershipRole.CLUB_ADMIN,
            ]
        elif segment == BlastTargetSegment.MEMBERS:
            role_filter = [ClubMembershipRole.MEMBER]
        elif segment == BlastTargetSegment.STAFF:
            role_filter = [ClubMembershipRole.CLUB_STAFF]
        elif segment == BlastTargetSegment.ADMIN:
            role_filter = [ClubMembershipRole.CLUB_ADMIN]

        memberships = (
            self._db.query(ClubMembership)
            .filter(
                ClubMembership.club_id == club_id,
                ClubMembership.status == ClubMembershipStatus.ACTIVE,
                ClubMembership.role.in_(role_filter),
                ClubMembership.person_id.isnot(None),
            )
            .all()
        )
        person_ids = [m.person_id for m in memberships if m.person_id is not None]
        if not person_ids:
            return []
        return self._db.query(Person).filter(Person.id.in_(person_ids)).all()

    def _attempt_email_delivery(self, blast: CommunicationBlast, recipients: list[Person]) -> str:
        from app.config import get_settings

        settings = get_settings()
        smtp_host = getattr(settings, "comms_smtp_host", None)
        if not smtp_host:
            _log.info(
                "Email blast id=%s: no SMTP provider configured. "
                "Logging %d recipient(s) as tracked handoff.",
                blast.id,
                len(recipients),
            )
            for person in recipients:
                _log.info("  Blast recipient: person_id=%s name=%s", person.id, person.full_name)
            return (
                f"Email delivery tracked for {len(recipients)} recipient(s). "
                "No SMTP provider is configured; delivery was logged as a tracked handoff."
            )

        # SMTP configured — attempt delivery
        import smtplib
        from email.mime.text import MIMEText

        sent_count = 0
        failed_count = 0
        for person in recipients:
            email = getattr(person, "email", None)
            if not email:
                continue
            try:
                msg = MIMEText(blast.body, "plain")
                msg["Subject"] = blast.subject
                msg["From"] = getattr(settings, "comms_smtp_from", "noreply@greenlink.app")
                msg["To"] = email
                with smtplib.SMTP(smtp_host, getattr(settings, "comms_smtp_port", 587)) as server:
                    server.sendmail(msg["From"], [email], msg.as_string())
                sent_count += 1
            except Exception:
                _log.exception("Failed to send blast email to person_id=%s", person.id)
                failed_count += 1

        return f"Email sent to {sent_count} recipient(s). {failed_count} failed."
