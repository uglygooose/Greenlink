from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    BookingParticipantType,
    BookingRuleAppliesTo,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    Person,
)
from app.schemas.bookings import BookingCreateFailureDetail, BookingCreateParticipantInput

STAFF_MEMBERSHIP_ROLES = {ClubMembershipRole.CLUB_ADMIN, ClubMembershipRole.CLUB_STAFF}


@dataclass(slots=True)
class ResolvedBookingParticipant:
    participant_type: BookingParticipantType
    person_id: uuid.UUID | None
    club_membership_id: uuid.UUID | None
    display_name: str
    guest_name: str | None
    sort_order: int
    is_primary: bool


class BookingParticipantResolver:
    def __init__(self, db: Session) -> None:
        self.db = db

    def resolve(
        self,
        *,
        club_id: uuid.UUID,
        participants: Sequence[BookingCreateParticipantInput],
    ) -> tuple[
        list[ResolvedBookingParticipant],
        ResolvedBookingParticipant | None,
        list[BookingCreateFailureDetail],
    ]:
        failures: list[BookingCreateFailureDetail] = []
        person_ids = [
            participant.person_id
            for participant in participants
            if participant.person_id is not None
        ]
        if len(set(person_ids)) != len(person_ids):
            failures.append(
                BookingCreateFailureDetail(
                    code="duplicate_person_participant",
                    message="Each person may only appear once in a booking",
                    field="participants",
                )
            )
            return [], None, failures

        persons = {
            person.id: person
            for person in self.db.scalars(select(Person).where(Person.id.in_(person_ids))).all()
        }
        memberships = {
            membership.person_id: membership
            for membership in self.db.scalars(
                select(ClubMembership).where(
                    ClubMembership.club_id == club_id,
                    ClubMembership.person_id.in_(person_ids),
                    ClubMembership.status == ClubMembershipStatus.ACTIVE,
                )
            ).all()
        }

        resolved: list[ResolvedBookingParticipant] = []
        primary: ResolvedBookingParticipant | None = None
        for index, participant in enumerate(participants):
            if participant.participant_type == BookingParticipantType.GUEST:
                resolved_participant = ResolvedBookingParticipant(
                    participant_type=participant.participant_type,
                    person_id=None,
                    club_membership_id=None,
                    display_name=participant.guest_name or "Guest",
                    guest_name=participant.guest_name,
                    sort_order=index,
                    is_primary=participant.is_primary,
                )
            else:
                assert participant.person_id is not None
                person = persons.get(participant.person_id)
                membership = memberships.get(participant.person_id)
                if person is None:
                    failures.append(
                        BookingCreateFailureDetail(
                            code="person_not_found",
                            message="person_id was not found",
                            field=f"participants[{index}].person_id",
                        )
                    )
                    continue
                if membership is None:
                    failures.append(
                        BookingCreateFailureDetail(
                            code="membership_required",
                            message="member and staff participants require an active club membership",
                            field=f"participants[{index}].person_id",
                        )
                    )
                    continue
                if (
                    participant.participant_type == BookingParticipantType.STAFF
                    and membership.role not in STAFF_MEMBERSHIP_ROLES
                ):
                    failures.append(
                        BookingCreateFailureDetail(
                            code="staff_membership_required",
                            message="staff participants require a club staff or club admin membership",
                            field=f"participants[{index}].person_id",
                        )
                    )
                    continue
                resolved_participant = ResolvedBookingParticipant(
                    participant_type=participant.participant_type,
                    person_id=person.id,
                    club_membership_id=membership.id,
                    display_name=person.full_name,
                    guest_name=None,
                    sort_order=index,
                    is_primary=participant.is_primary,
                )

            resolved.append(resolved_participant)
            if resolved_participant.is_primary:
                primary = resolved_participant

        return resolved, primary, failures


def derive_applies_to(participant_type: BookingParticipantType) -> BookingRuleAppliesTo:
    if participant_type == BookingParticipantType.STAFF:
        return BookingRuleAppliesTo.STAFF
    return BookingRuleAppliesTo.MEMBER
