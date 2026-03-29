from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.datetime import utc_now
from app.domain.people.normalization import normalize_email, normalize_phone
from app.models import (
    BulkIntakeAction,
    ClubMembership,
    IntegrityIssueScope,
    IntegrityIssueSeverity,
    Person,
)
from app.schemas.people import (
    BulkIntakeOutcome,
    BulkIntakeRequest,
    BulkIntakeResult,
    ClubMembershipCreateRequest,
    ClubMembershipUpdateRequest,
    DuplicateCandidate,
    IntegrityIssue,
    PersonCreateRequest,
)
from app.services.people_service import PeopleService


@dataclass(slots=True)
class BulkMatchResult:
    person: Person | None
    duplicates: list[DuplicateCandidate]
    explanation: str


class BulkIntakeService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.people_service = PeopleService(db)

    def preview(self, club_id: uuid.UUID, payload: BulkIntakeRequest) -> BulkIntakeResult:
        return self._run(club_id, payload, apply_changes=False)

    def process(
        self,
        club_id: uuid.UUID,
        payload: BulkIntakeRequest,
        *,
        actor_user_id: uuid.UUID | None = None,
        correlation_id: str | None = None,
    ) -> BulkIntakeResult:
        return self._run(
            club_id,
            payload,
            apply_changes=True,
            actor_user_id=actor_user_id,
            correlation_id=correlation_id,
        )

    def _run(
        self,
        club_id: uuid.UUID,
        payload: BulkIntakeRequest,
        *,
        apply_changes: bool,
        actor_user_id: uuid.UUID | None = None,
        correlation_id: str | None = None,
    ) -> BulkIntakeResult:
        outcomes: list[BulkIntakeOutcome] = []
        counts = {action.value: 0 for action in BulkIntakeAction}
        for index, row in enumerate(payload.rows, start=1):
            outcome = self._classify_row(
                club_id,
                row_index=index,
                row=row,
                apply_changes=apply_changes,
                actor_user_id=actor_user_id,
                correlation_id=correlation_id,
            )
            counts[outcome.action.value] += 1
            outcomes.append(outcome)
        if not apply_changes:
            self.db.rollback()
        return BulkIntakeResult(
            mode="process" if apply_changes else "preview",
            club_id=club_id,
            outcomes=outcomes,
            counts=counts,
        )

    def _classify_row(
        self,
        club_id: uuid.UUID,
        *,
        row_index: int,
        row,
        apply_changes: bool,
        actor_user_id: uuid.UUID | None,
        correlation_id: str | None,
    ) -> BulkIntakeOutcome:
        warnings: list[IntegrityIssue] = []
        blockers: list[IntegrityIssue] = []

        first_name = (row.first_name or "").strip()
        normalized_email = normalize_email(row.email)
        normalized_phone = normalize_phone(row.phone)

        if not first_name:
            blockers.append(
                self._issue("missing_first_name", "Incoming row is missing first name.")
            )
        if normalized_email is None and normalized_phone is None:
            warnings.append(
                self._issue(
                    "missing_contact_method",
                    "Incoming row has no email or phone, so duplicate detection is weaker.",
                    severity=IntegrityIssueSeverity.WARNING,
                )
            )
        if blockers:
            return BulkIntakeOutcome(
                row_index=row_index,
                source_row_id=row.source_row_id,
                action=BulkIntakeAction.REJECT_ROW,
                warnings=warnings,
                blockers=blockers,
                explanation="Row is missing required core identity data.",
            )

        match_result = self._match_person(normalized_email, normalized_phone)
        if match_result.person is None and match_result.duplicates:
            blockers.append(
                self._issue(
                    "ambiguous_duplicate_match",
                    "Incoming row matched multiple existing people and needs review.",
                )
            )
            return BulkIntakeOutcome(
                row_index=row_index,
                source_row_id=row.source_row_id,
                action=BulkIntakeAction.REJECT_ROW,
                warnings=warnings,
                blockers=blockers,
                duplicate_candidates=match_result.duplicates,
                explanation=match_result.explanation,
            )

        matched_person = match_result.person
        if matched_person is None:
            explanation = "No existing person matched; create person and membership."
            if apply_changes:
                matched_person = self.people_service.create_person(
                    self._row_to_person_request(row),
                    actor_user_id=actor_user_id,
                    correlation_id=correlation_id,
                )
                membership = self.people_service.upsert_membership(
                    club_id=club_id,
                    payload=self._row_to_membership_request(row, matched_person.id),
                    actor_user_id=actor_user_id,
                    correlation_id=correlation_id,
                )
                return BulkIntakeOutcome(
                    row_index=row_index,
                    source_row_id=row.source_row_id,
                    action=BulkIntakeAction.CREATE_PERSON_CREATE_MEMBERSHIP,
                    matched_person_id=matched_person.id,
                    matched_membership_id=membership.id,
                    warnings=warnings,
                    blockers=blockers,
                    explanation=explanation,
                )
            return BulkIntakeOutcome(
                row_index=row_index,
                source_row_id=row.source_row_id,
                action=BulkIntakeAction.CREATE_PERSON_CREATE_MEMBERSHIP,
                warnings=warnings,
                blockers=blockers,
                explanation=explanation,
            )

        membership = self.db.scalar(
            select(ClubMembership).where(
                ClubMembership.club_id == club_id,
                ClubMembership.person_id == matched_person.id,
            )
        )
        if membership is None:
            explanation = "Matched an existing person and will create a new club membership."
            if apply_changes:
                created = self.people_service.upsert_membership(
                    club_id=club_id,
                    payload=self._row_to_membership_request(row, matched_person.id),
                    actor_user_id=actor_user_id,
                    correlation_id=correlation_id,
                )
                return BulkIntakeOutcome(
                    row_index=row_index,
                    source_row_id=row.source_row_id,
                    action=BulkIntakeAction.MATCH_EXISTING_CREATE_MEMBERSHIP,
                    matched_person_id=matched_person.id,
                    matched_membership_id=created.id,
                    warnings=warnings,
                    blockers=blockers,
                    duplicate_candidates=match_result.duplicates,
                    explanation=explanation,
                )
            return BulkIntakeOutcome(
                row_index=row_index,
                source_row_id=row.source_row_id,
                action=BulkIntakeAction.MATCH_EXISTING_CREATE_MEMBERSHIP,
                matched_person_id=matched_person.id,
                warnings=warnings,
                blockers=blockers,
                duplicate_candidates=match_result.duplicates,
                explanation=explanation,
            )

        membership_changed = any(
            [
                membership.role != row.role,
                membership.status != row.status,
                membership.membership_number != row.membership_number,
                membership.membership_metadata != dict(row.membership_metadata),
            ]
        )
        if not membership_changed:
            warnings.append(
                self._issue(
                    "membership_already_current",
                    "Existing membership already matches the incoming row.",
                    severity=IntegrityIssueSeverity.WARNING,
                )
            )
            return BulkIntakeOutcome(
                row_index=row_index,
                source_row_id=row.source_row_id,
                action=BulkIntakeAction.WARNING_ONLY,
                matched_person_id=matched_person.id,
                matched_membership_id=membership.id,
                warnings=warnings,
                blockers=blockers,
                duplicate_candidates=match_result.duplicates,
                explanation="Matched person and membership already exist with the same state.",
            )

        explanation = "Matched an existing person and will update the club membership."
        if apply_changes:
            updated = self.people_service.update_membership(
                membership,
                payload=self._row_to_membership_update_request(row),
                actor_user_id=actor_user_id,
                correlation_id=correlation_id,
            )
            return BulkIntakeOutcome(
                row_index=row_index,
                source_row_id=row.source_row_id,
                action=BulkIntakeAction.MATCH_EXISTING_UPDATE_MEMBERSHIP,
                matched_person_id=matched_person.id,
                matched_membership_id=updated.id,
                warnings=warnings,
                blockers=blockers,
                duplicate_candidates=match_result.duplicates,
                explanation=explanation,
            )
        return BulkIntakeOutcome(
            row_index=row_index,
            source_row_id=row.source_row_id,
            action=BulkIntakeAction.MATCH_EXISTING_UPDATE_MEMBERSHIP,
            matched_person_id=matched_person.id,
            matched_membership_id=membership.id,
            warnings=warnings,
            blockers=blockers,
            duplicate_candidates=match_result.duplicates,
            explanation=explanation,
        )

    def _match_person(
        self, normalized_email: str | None, normalized_phone: str | None
    ) -> BulkMatchResult:
        email_matches: list[Person] = []
        phone_matches: list[Person] = []
        if normalized_email is not None:
            email_matches = list(
                self.db.scalars(
                    select(Person).where(Person.normalized_email == normalized_email)
                ).all()
            )
        if normalized_phone is not None:
            phone_matches = list(
                self.db.scalars(
                    select(Person).where(Person.normalized_phone == normalized_phone)
                ).all()
            )

        unique_matches = {person.id: person for person in [*email_matches, *phone_matches]}
        if not unique_matches:
            return BulkMatchResult(person=None, duplicates=[], explanation="No match found.")
        if len(unique_matches) > 1:
            duplicates = [
                DuplicateCandidate(
                    person_id=person.id,
                    full_name=person.full_name,
                    email=person.email,
                    phone=person.phone,
                    match_reason="normalized_email_or_phone",
                )
                for person in unique_matches.values()
            ]
            return BulkMatchResult(
                person=None,
                duplicates=sorted(duplicates, key=lambda item: item.full_name.lower()),
                explanation="Multiple existing people matched the same intake row.",
            )
        matched_person = next(iter(unique_matches.values()))
        duplicates = []
        if normalized_email is not None and normalized_phone is not None:
            duplicates = [
                DuplicateCandidate(
                    person_id=matched_person.id,
                    full_name=matched_person.full_name,
                    email=matched_person.email,
                    phone=matched_person.phone,
                    match_reason="normalized_email_and_phone",
                )
            ]
        return BulkMatchResult(
            person=matched_person,
            duplicates=duplicates,
            explanation="Deterministic contact match found.",
        )

    def _issue(
        self,
        code: str,
        message: str,
        *,
        severity: IntegrityIssueSeverity = IntegrityIssueSeverity.BLOCKER,
    ) -> IntegrityIssue:
        return IntegrityIssue(
            code=code,
            message=message,
            severity=severity,
            scope=IntegrityIssueScope.PERSON,
        )

    def _row_to_person_request(self, row) -> PersonCreateRequest:
        return PersonCreateRequest(
            first_name=row.first_name or "",
            last_name=row.last_name or "",
            email=row.email,
            phone=row.phone,
            external_ref=row.external_ref,
            notes=row.notes,
            profile_metadata=dict(row.profile_metadata),
        )

    def _row_to_membership_request(self, row, person_id: uuid.UUID) -> ClubMembershipCreateRequest:
        return ClubMembershipCreateRequest(
            person_id=person_id,
            role=row.role,
            status=row.status,
            joined_at=utc_now(),
            membership_number=row.membership_number,
            membership_metadata=dict(row.membership_metadata),
        )

    def _row_to_membership_update_request(self, row) -> ClubMembershipUpdateRequest:
        return ClubMembershipUpdateRequest(
            role=row.role,
            status=row.status,
            membership_number=row.membership_number,
            membership_metadata=dict(row.membership_metadata),
        )
