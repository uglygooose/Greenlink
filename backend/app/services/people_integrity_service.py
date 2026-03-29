from __future__ import annotations

import uuid

from sqlalchemy import Select, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    AccountCustomer,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    IntegrityIssueScope,
    IntegrityIssueSeverity,
    Person,
    ReadinessStatus,
)
from app.schemas.people import (
    AccountCustomerReadinessSummary,
    DuplicateCandidate,
    IntegrityIssue,
    MembershipReadinessSummary,
    PersonIntegrityResponse,
    PersonResponse,
    ReadinessSummary,
)


class PeopleIntegrityService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def evaluate(
        self,
        person: Person,
        *,
        club_id: uuid.UUID | None = None,
    ) -> PersonIntegrityResponse:
        hydrated_person = self.db.scalar(self._base_person_query().where(Person.id == person.id))
        assert hydrated_person is not None

        duplicates = self._duplicate_candidates(hydrated_person)
        profile_warnings, profile_blockers = self._evaluate_profile(hydrated_person, duplicates)

        memberships = hydrated_person.memberships
        if club_id is not None:
            memberships = [
                membership for membership in memberships if membership.club_id == club_id
            ]

        membership_summaries: list[MembershipReadinessSummary] = []
        account_summaries: list[AccountCustomerReadinessSummary] = []
        exceptions = [*profile_warnings, *profile_blockers]

        for membership in memberships:
            warnings, blockers = self._evaluate_membership(hydrated_person, membership)
            membership_summaries.append(
                MembershipReadinessSummary(
                    membership_id=membership.id,
                    club_id=membership.club_id,
                    role=membership.role,
                    status_value=membership.status,
                    ready=not blockers,
                    status=self._status_for(warnings, blockers),
                    warnings=warnings,
                    blockers=blockers,
                )
            )
            exceptions.extend(warnings)
            exceptions.extend(blockers)

        account_customers = hydrated_person.account_customers
        if club_id is not None:
            account_customers = [item for item in account_customers if item.club_id == club_id]

        for account_customer in account_customers:
            warnings, blockers = self._evaluate_account_customer(hydrated_person, account_customer)
            account_summaries.append(
                AccountCustomerReadinessSummary(
                    account_customer_id=account_customer.id,
                    club_id=account_customer.club_id,
                    ready=not blockers,
                    status=self._status_for(warnings, blockers),
                    warnings=warnings,
                    blockers=blockers,
                )
            )
            exceptions.extend(warnings)
            exceptions.extend(blockers)

        return PersonIntegrityResponse(
            person=self._to_person_response(hydrated_person),
            duplicate_candidates=duplicates,
            profile=ReadinessSummary(
                ready=not profile_blockers,
                status=self._status_for(profile_warnings, profile_blockers),
                warnings=profile_warnings,
                blockers=profile_blockers,
            ),
            memberships=membership_summaries,
            account_customers=account_summaries,
            exceptions=exceptions,
        )

    def _duplicate_candidates(self, person: Person) -> list[DuplicateCandidate]:
        candidates: dict[uuid.UUID, DuplicateCandidate] = {}
        matchers: list[tuple[str, str | None]] = [
            ("normalized_email", person.normalized_email),
            ("normalized_phone", person.normalized_phone),
        ]
        for field_name, value in matchers:
            if value is None:
                continue
            column = getattr(Person, field_name)
            rows = self.db.scalars(
                self._base_person_query().where(Person.id != person.id, column == value)
            ).all()
            for row in rows:
                candidates[row.id] = DuplicateCandidate(
                    person_id=row.id,
                    full_name=row.full_name,
                    email=row.email,
                    phone=row.phone,
                    match_reason=field_name,
                )
        return sorted(candidates.values(), key=lambda item: item.full_name.lower())

    def _evaluate_profile(
        self, person: Person, duplicates: list[DuplicateCandidate]
    ) -> tuple[list[IntegrityIssue], list[IntegrityIssue]]:
        warnings: list[IntegrityIssue] = []
        blockers: list[IntegrityIssue] = []
        if not person.first_name.strip():
            blockers.append(
                IntegrityIssue(
                    code="missing_first_name",
                    message="Person first name is missing.",
                    severity=IntegrityIssueSeverity.BLOCKER,
                    scope=IntegrityIssueScope.PERSON,
                    resource_id=person.id,
                )
            )
        if not person.last_name.strip():
            warnings.append(
                IntegrityIssue(
                    code="missing_last_name",
                    message="Person last name is missing.",
                    severity=IntegrityIssueSeverity.WARNING,
                    scope=IntegrityIssueScope.PERSON,
                    resource_id=person.id,
                )
            )
        if person.normalized_email is None and person.normalized_phone is None:
            blockers.append(
                IntegrityIssue(
                    code="missing_contact_method",
                    message="Person needs at least one contact method.",
                    severity=IntegrityIssueSeverity.BLOCKER,
                    scope=IntegrityIssueScope.PERSON,
                    resource_id=person.id,
                )
            )
        if duplicates:
            warnings.append(
                IntegrityIssue(
                    code="duplicate_risk",
                    message="Possible duplicate people were found by normalized contact data.",
                    severity=IntegrityIssueSeverity.WARNING,
                    scope=IntegrityIssueScope.PERSON,
                    resource_id=person.id,
                )
            )
        return warnings, blockers

    def _evaluate_membership(
        self, person: Person, membership: ClubMembership
    ) -> tuple[list[IntegrityIssue], list[IntegrityIssue]]:
        warnings: list[IntegrityIssue] = []
        blockers: list[IntegrityIssue] = []
        if membership.status != ClubMembershipStatus.ACTIVE:
            blockers.append(
                IntegrityIssue(
                    code="membership_not_active",
                    message="Membership is not active.",
                    severity=IntegrityIssueSeverity.BLOCKER,
                    scope=IntegrityIssueScope.MEMBERSHIP,
                    resource_id=membership.id,
                )
            )
        if membership.role == ClubMembershipRole.MEMBER and not membership.membership_number:
            warnings.append(
                IntegrityIssue(
                    code="missing_membership_number",
                    message="Member membership number is not set.",
                    severity=IntegrityIssueSeverity.WARNING,
                    scope=IntegrityIssueScope.MEMBERSHIP,
                    resource_id=membership.id,
                )
            )
        if person.normalized_email is None and person.normalized_phone is None:
            blockers.append(
                IntegrityIssue(
                    code="membership_contact_incomplete",
                    message="Membership is missing a usable person contact method.",
                    severity=IntegrityIssueSeverity.BLOCKER,
                    scope=IntegrityIssueScope.MEMBERSHIP,
                    resource_id=membership.id,
                )
            )
        return warnings, blockers

    def _evaluate_account_customer(
        self, person: Person, account_customer: AccountCustomer
    ) -> tuple[list[IntegrityIssue], list[IntegrityIssue]]:
        warnings: list[IntegrityIssue] = []
        blockers: list[IntegrityIssue] = []
        if not account_customer.active:
            warnings.append(
                IntegrityIssue(
                    code="account_customer_inactive",
                    message="Account customer is inactive.",
                    severity=IntegrityIssueSeverity.WARNING,
                    scope=IntegrityIssueScope.ACCOUNT_CUSTOMER,
                    resource_id=account_customer.id,
                )
            )
        billing_email = account_customer.billing_email or person.email
        billing_phone = account_customer.billing_phone or person.phone
        if billing_email is None and billing_phone is None:
            blockers.append(
                IntegrityIssue(
                    code="account_customer_missing_billing_contact",
                    message="Account customer needs a billing contact method.",
                    severity=IntegrityIssueSeverity.BLOCKER,
                    scope=IntegrityIssueScope.ACCOUNT_CUSTOMER,
                    resource_id=account_customer.id,
                )
            )
        return warnings, blockers

    def _status_for(
        self, warnings: list[IntegrityIssue], blockers: list[IntegrityIssue]
    ) -> ReadinessStatus:
        if blockers:
            return ReadinessStatus.BLOCKED
        if warnings:
            return ReadinessStatus.WARNING
        return ReadinessStatus.READY

    def _base_person_query(self) -> Select[tuple[Person]]:
        return select(Person).options(
            selectinload(Person.user),
            selectinload(Person.memberships).selectinload(ClubMembership.club),
            selectinload(Person.account_customers),
        )

    def _to_person_response(self, person: Person) -> PersonResponse:
        return PersonResponse(
            id=person.id,
            first_name=person.first_name,
            last_name=person.last_name,
            full_name=person.full_name,
            email=person.email,
            phone=person.phone,
            date_of_birth=person.date_of_birth,
            gender=person.gender,
            external_ref=person.external_ref,
            notes=person.notes,
            profile_metadata=person.profile_metadata,
            linked_user_id=person.user.id if person.user is not None else None,
            created_at=person.created_at,
            updated_at=person.updated_at,
        )
