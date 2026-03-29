from __future__ import annotations

import uuid

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.datetime import ensure_utc, utc_now
from app.core.exceptions import ConflictError, NotFoundError
from app.domain.people.normalization import (
    build_full_name,
    clean_name,
    normalize_email,
    normalize_phone,
)
from app.events.publisher import DatabaseEventPublisher
from app.models import AccountCustomer, ClubMembership, Person, User, UserType
from app.schemas.people import (
    AccountCustomerCreateRequest,
    AccountCustomerResponse,
    ClubMembershipCreateRequest,
    ClubMembershipResponse,
    ClubMembershipUpdateRequest,
    ClubPersonResponse,
    PersonCreateRequest,
    PersonResponse,
    PersonUpdateRequest,
)


class PeopleService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.publisher = DatabaseEventPublisher(db)

    def create_person(
        self,
        payload: PersonCreateRequest,
        *,
        actor_user_id: uuid.UUID | None = None,
        correlation_id: str | None = None,
    ) -> Person:
        person = Person(
            first_name=clean_name(payload.first_name),
            last_name=clean_name(payload.last_name),
            full_name=build_full_name(payload.first_name, payload.last_name),
            email=normalize_email(payload.email),
            normalized_email=normalize_email(payload.email),
            phone=payload.phone.strip() if payload.phone else None,
            normalized_phone=normalize_phone(payload.phone),
            date_of_birth=payload.date_of_birth,
            gender=payload.gender,
            external_ref=payload.external_ref,
            notes=payload.notes,
            profile_metadata=dict(payload.profile_metadata),
        )
        self.db.add(person)
        self.db.flush()
        self.publisher.publish(
            event_type="person.created",
            aggregate_type="person",
            aggregate_id=str(person.id),
            payload={"email": person.email, "external_ref": person.external_ref},
            correlation_id=correlation_id,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        self.db.refresh(person)
        return person

    def update_person(
        self,
        person: Person,
        payload: PersonUpdateRequest,
        *,
        actor_user_id: uuid.UUID | None = None,
        correlation_id: str | None = None,
    ) -> Person:
        if payload.first_name is not None:
            person.first_name = clean_name(payload.first_name)
        if payload.last_name is not None:
            person.last_name = clean_name(payload.last_name)
        if payload.email is not None:
            person.email = normalize_email(payload.email)
            person.normalized_email = normalize_email(payload.email)
        if payload.phone is not None:
            person.phone = payload.phone.strip() or None
            person.normalized_phone = normalize_phone(payload.phone)
        if payload.date_of_birth is not None:
            person.date_of_birth = payload.date_of_birth
        if payload.gender is not None:
            person.gender = payload.gender
        if payload.external_ref is not None:
            person.external_ref = payload.external_ref
        if payload.notes is not None:
            person.notes = payload.notes
        if payload.profile_metadata is not None:
            person.profile_metadata = dict(payload.profile_metadata)
        person.full_name = build_full_name(person.first_name, person.last_name)
        self.db.add(person)
        self.publisher.publish(
            event_type="person.updated",
            aggregate_type="person",
            aggregate_id=str(person.id),
            payload={"email": person.email},
            correlation_id=correlation_id,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        self.db.refresh(person)
        return person

    def get_person(self, person_id: uuid.UUID) -> Person:
        person = self.db.scalar(self._base_person_query().where(Person.id == person_id))
        if person is None:
            raise NotFoundError("Person not found")
        return person

    def list_people(self, *, query: str | None = None, limit: int = 50) -> list[Person]:
        statement = self._base_person_query().order_by(Person.full_name.asc()).limit(limit)
        if query:
            like = f"%{query.strip().lower()}%"
            statement = statement.where(
                or_(
                    Person.full_name.ilike(like),
                    Person.normalized_email.ilike(like),
                    Person.normalized_phone.ilike(like),
                    Person.external_ref.ilike(like),
                )
            )
        return list(self.db.scalars(statement).unique().all())

    def list_club_people(
        self,
        *,
        club_id: uuid.UUID,
        query: str | None = None,
        limit: int = 50,
    ) -> list[ClubPersonResponse]:
        statement = (
            select(ClubMembership)
            .options(
                selectinload(ClubMembership.club),
                selectinload(ClubMembership.person).selectinload(Person.user),
            )
            .where(ClubMembership.club_id == club_id)
            .order_by(ClubMembership.joined_at.asc())
            .limit(limit)
        )
        if query:
            like = f"%{query.strip().lower()}%"
            statement = statement.join(ClubMembership.person).where(
                or_(
                    Person.full_name.ilike(like),
                    Person.normalized_email.ilike(like),
                    Person.normalized_phone.ilike(like),
                    ClubMembership.membership_number.ilike(like),
                )
            )
        memberships = self.db.scalars(statement).unique().all()
        return [
            ClubPersonResponse(
                person=self.to_person_response(membership.person),
                membership=self.to_membership_response(membership),
            )
            for membership in memberships
        ]

    def upsert_membership(
        self,
        *,
        club_id: uuid.UUID,
        payload: ClubMembershipCreateRequest,
        actor_user_id: uuid.UUID | None = None,
        correlation_id: str | None = None,
    ) -> ClubMembership:
        person = self.db.get(Person, payload.person_id)
        if person is None:
            raise NotFoundError("Person not found")
        self._ensure_membership_number_available(
            club_id,
            payload.membership_number,
            exclude_membership_id=None,
        )
        membership = self.db.scalar(
            select(ClubMembership).where(
                ClubMembership.person_id == payload.person_id,
                ClubMembership.club_id == club_id,
            )
        )
        if membership is None:
            membership = ClubMembership(
                person_id=payload.person_id,
                club_id=club_id,
                role=payload.role,
                status=payload.status,
                joined_at=ensure_utc(payload.joined_at) or utc_now(),
                is_primary=payload.is_primary,
                membership_number=payload.membership_number,
                membership_metadata=dict(payload.membership_metadata),
            )
            self.db.add(membership)
            event_type = "club_membership.created"
        else:
            membership.role = payload.role
            membership.status = payload.status
            membership.joined_at = ensure_utc(payload.joined_at) or membership.joined_at
            membership.is_primary = payload.is_primary
            membership.membership_number = payload.membership_number
            membership.membership_metadata = dict(payload.membership_metadata)
            event_type = "club_membership.updated"
        self.db.flush()
        self.publisher.publish(
            event_type=event_type,
            aggregate_type="club_membership",
            aggregate_id=str(membership.id),
            payload={"club_id": str(club_id), "person_id": str(payload.person_id)},
            correlation_id=correlation_id,
            club_id=club_id,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        self.db.refresh(membership)
        return membership

    def update_membership(
        self,
        membership: ClubMembership,
        payload: ClubMembershipUpdateRequest,
        *,
        actor_user_id: uuid.UUID | None = None,
        correlation_id: str | None = None,
    ) -> ClubMembership:
        self._ensure_membership_number_available(
            membership.club_id,
            payload.membership_number,
            exclude_membership_id=membership.id,
        )
        if payload.role is not None:
            membership.role = payload.role
        if payload.status is not None:
            membership.status = payload.status
        if payload.joined_at is not None:
            membership.joined_at = ensure_utc(payload.joined_at) or membership.joined_at
        if payload.is_primary is not None:
            membership.is_primary = payload.is_primary
        if payload.membership_number is not None:
            membership.membership_number = payload.membership_number
        if payload.membership_metadata is not None:
            membership.membership_metadata = dict(payload.membership_metadata)
        self.db.add(membership)
        self.publisher.publish(
            event_type="club_membership.updated",
            aggregate_type="club_membership",
            aggregate_id=str(membership.id),
            payload={"club_id": str(membership.club_id), "person_id": str(membership.person_id)},
            correlation_id=correlation_id,
            club_id=membership.club_id,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        self.db.refresh(membership)
        return membership

    def list_person_memberships(
        self,
        *,
        person_id: uuid.UUID,
        club_id: uuid.UUID | None = None,
    ) -> list[ClubMembership]:
        statement = (
            select(ClubMembership)
            .options(selectinload(ClubMembership.club))
            .where(ClubMembership.person_id == person_id)
            .order_by(ClubMembership.joined_at.asc())
        )
        if club_id is not None:
            statement = statement.where(ClubMembership.club_id == club_id)
        return list(self.db.scalars(statement).all())

    def create_account_customer(
        self,
        *,
        club_id: uuid.UUID,
        payload: AccountCustomerCreateRequest,
        actor_user_id: uuid.UUID | None = None,
        correlation_id: str | None = None,
    ) -> AccountCustomer:
        person = self.db.get(Person, payload.person_id)
        if person is None:
            raise NotFoundError("Person not found")
        existing = self.db.scalar(
            select(AccountCustomer).where(
                AccountCustomer.club_id == club_id,
                AccountCustomer.account_code == payload.account_code,
            )
        )
        if existing is not None:
            raise ConflictError("Account code is already in use for this club")
        linked = self.db.scalar(
            select(AccountCustomer).where(
                AccountCustomer.club_id == club_id, AccountCustomer.person_id == payload.person_id
            )
        )
        if linked is not None:
            raise ConflictError("Person already has an account customer for this club")
        account_customer = AccountCustomer(
            club_id=club_id,
            person_id=payload.person_id,
            account_code=payload.account_code.strip(),
            active=payload.active,
            billing_email=normalize_email(payload.billing_email),
            billing_phone=payload.billing_phone.strip() if payload.billing_phone else None,
            billing_metadata=dict(payload.billing_metadata),
        )
        self.db.add(account_customer)
        self.db.flush()
        self.publisher.publish(
            event_type="account_customer.created",
            aggregate_type="account_customer",
            aggregate_id=str(account_customer.id),
            payload={"club_id": str(club_id), "person_id": str(payload.person_id)},
            correlation_id=correlation_id,
            club_id=club_id,
            actor_user_id=actor_user_id,
        )
        self.db.commit()
        self.db.refresh(account_customer)
        return account_customer

    def ensure_person_access(
        self,
        *,
        person_id: uuid.UUID,
        club_id: uuid.UUID | None,
        user: User,
    ) -> Person:
        person = self.get_person(person_id)
        if user.user_type == UserType.SUPERADMIN:
            return person
        if club_id is None:
            raise NotFoundError("Person not found")
        has_membership = any(membership.club_id == club_id for membership in person.memberships)
        if not has_membership:
            raise NotFoundError("Person not found")
        return person

    def ensure_membership_access(
        self,
        *,
        membership_id: uuid.UUID,
        club_id: uuid.UUID | None,
        user: User,
    ) -> ClubMembership:
        membership = self.db.scalar(
            select(ClubMembership)
            .options(selectinload(ClubMembership.club), selectinload(ClubMembership.person))
            .where(ClubMembership.id == membership_id)
        )
        if membership is None:
            raise NotFoundError("Membership not found")
        if user.user_type == UserType.SUPERADMIN:
            return membership
        if club_id is None or membership.club_id != club_id:
            raise NotFoundError("Membership not found")
        return membership

    def link_user_to_person(self, user: User, person: Person) -> None:
        user.person_id = person.id
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

    def to_person_response(self, person: Person) -> PersonResponse:
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

    def to_membership_response(self, membership: ClubMembership) -> ClubMembershipResponse:
        return ClubMembershipResponse(
            id=membership.id,
            club_id=membership.club_id,
            person_id=membership.person_id,
            role=membership.role,
            status=membership.status,
            joined_at=membership.joined_at,
            is_primary=membership.is_primary,
            membership_number=membership.membership_number,
            membership_metadata=membership.membership_metadata,
            club_name=membership.club.name,
            club_slug=membership.club.slug,
        )

    def to_account_customer_response(
        self, account_customer: AccountCustomer
    ) -> AccountCustomerResponse:
        return AccountCustomerResponse(
            id=account_customer.id,
            club_id=account_customer.club_id,
            person_id=account_customer.person_id,
            account_code=account_customer.account_code,
            active=account_customer.active,
            billing_email=account_customer.billing_email,
            billing_phone=account_customer.billing_phone,
            billing_metadata=account_customer.billing_metadata,
            created_at=account_customer.created_at,
            updated_at=account_customer.updated_at,
        )

    def _ensure_membership_number_available(
        self,
        club_id: uuid.UUID,
        membership_number: str | None,
        *,
        exclude_membership_id: uuid.UUID | None,
    ) -> None:
        if not membership_number:
            return
        statement = select(ClubMembership.id).where(
            ClubMembership.club_id == club_id,
            ClubMembership.membership_number == membership_number,
        )
        if exclude_membership_id is not None:
            statement = statement.where(ClubMembership.id != exclude_membership_id)
        existing = self.db.scalar(statement)
        if existing is not None:
            raise ConflictError("Membership number is already in use for this club")

    def _base_person_query(self) -> Select[tuple[Person]]:
        return select(Person).options(
            selectinload(Person.user),
            selectinload(Person.memberships).selectinload(ClubMembership.club),
            selectinload(Person.account_customers),
        )
