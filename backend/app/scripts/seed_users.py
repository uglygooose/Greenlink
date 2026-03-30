from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select

from app.core.datetime import utc_now
from app.core.security import hash_password
from app.db import SessionLocal
from app.domain.people.normalization import build_full_name, normalize_email
from app.models import (
    Club,
    ClubMembership,
    ClubMembershipRole,
    ClubMembershipStatus,
    ClubModule,
    Person,
    PlatformState,
    User,
    UserType,
)

DEV_CLUB_NAME = "GreenLink Development Club"
DEV_CLUB_SLUG = "greenlink-dev"
DEV_CLUB_TIMEZONE = "Africa/Johannesburg"
DEV_MODULE_KEYS = ("communications", "finance", "golf", "pos")
SEED_PASSWORD = "Admin123!"


@dataclass(frozen=True, slots=True)
class SeedAccount:
    email: str
    display_name: str
    user_type: UserType
    membership_role: ClubMembershipRole | None = None
    membership_number: str | None = None


SEED_ACCOUNTS: tuple[SeedAccount, ...] = (
    SeedAccount(
        email="greenlinkgolfsa@gmail.com",
        display_name="GreenLink Superadmin",
        user_type=UserType.SUPERADMIN,
    ),
    SeedAccount(
        email="admin@greenlink.test",
        display_name="GreenLink Admin",
        user_type=UserType.USER,
        membership_role=ClubMembershipRole.CLUB_ADMIN,
        membership_number="GL-ADMIN-001",
    ),
    SeedAccount(
        email="staff@greenlink.test",
        display_name="GreenLink Staff",
        user_type=UserType.USER,
        membership_role=ClubMembershipRole.CLUB_STAFF,
        membership_number="GL-STAFF-001",
    ),
    SeedAccount(
        email="member@greenlink.test",
        display_name="GreenLink Member",
        user_type=UserType.USER,
        membership_role=ClubMembershipRole.MEMBER,
        membership_number="GL-MEMBER-001",
    ),
)


def split_name(display_name: str) -> tuple[str, str]:
    if " " in display_name:
        return display_name.split(" ", 1)
    return display_name, ""


def upsert_club(db) -> Club:
    club = db.scalar(select(Club).where(Club.slug == DEV_CLUB_SLUG))
    if club is None:
        club = Club(
            name=DEV_CLUB_NAME,
            slug=DEV_CLUB_SLUG,
            timezone=DEV_CLUB_TIMEZONE,
            onboarding_state="active",
            active=True,
        )
        db.add(club)
        db.flush()
    else:
        club.name = DEV_CLUB_NAME
        club.timezone = DEV_CLUB_TIMEZONE
        club.onboarding_state = "active"
        club.active = True

    existing_modules = {
        module.module_key: module
        for module in db.scalars(select(ClubModule).where(ClubModule.club_id == club.id)).all()
    }
    for module_key in DEV_MODULE_KEYS:
        module = existing_modules.get(module_key)
        if module is None:
            db.add(ClubModule(club_id=club.id, module_key=module_key, enabled=True))
        else:
            module.enabled = True

    return club


def upsert_person(db, account: SeedAccount) -> Person:
    normalized_email = normalize_email(account.email)
    first_name, last_name = split_name(account.display_name)
    person = db.scalar(select(Person).where(Person.normalized_email == normalized_email))
    if person is None:
        person = Person(
            first_name=first_name,
            last_name=last_name,
            full_name=build_full_name(first_name, last_name),
            email=normalized_email,
            normalized_email=normalized_email,
            profile_metadata={},
        )
        db.add(person)
        db.flush()
        return person

    person.first_name = first_name
    person.last_name = last_name
    person.full_name = build_full_name(first_name, last_name)
    person.email = normalized_email
    person.normalized_email = normalized_email
    return person


def upsert_user(db, account: SeedAccount, person: Person) -> User:
    normalized_email = normalize_email(account.email)
    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        user = User(
            email=normalized_email,
            password_hash=hash_password(SEED_PASSWORD),
            display_name=account.display_name,
            user_type=account.user_type,
            active=True,
            person_id=person.id,
        )
        db.add(user)
        db.flush()
        return user

    user.email = normalized_email
    user.password_hash = hash_password(SEED_PASSWORD)
    user.display_name = account.display_name
    user.user_type = account.user_type
    user.active = True
    user.person_id = person.id
    return user


def upsert_membership(db, person: Person, club: Club, account: SeedAccount) -> None:
    if account.membership_role is None:
        return

    membership = db.scalar(
        select(ClubMembership).where(
            ClubMembership.person_id == person.id,
            ClubMembership.club_id == club.id,
        )
    )
    if membership is None:
        membership = ClubMembership(
            person_id=person.id,
            club_id=club.id,
            role=account.membership_role,
            status=ClubMembershipStatus.ACTIVE,
            is_primary=True,
            membership_number=account.membership_number,
            membership_metadata={},
        )
        db.add(membership)
        return

    membership.role = account.membership_role
    membership.status = ClubMembershipStatus.ACTIVE
    membership.is_primary = True
    membership.membership_number = account.membership_number


def upsert_platform_state(db, *, superadmin_user: User, club: Club) -> None:
    state = db.get(PlatformState, 1)
    if state is None:
        state = PlatformState(id=1)
        db.add(state)
        db.flush()

    state.is_initialized = True
    state.initialized_at = state.initialized_at or utc_now()
    state.initialized_by_user_id = superadmin_user.id
    state.initial_club_id = club.id


def seed_users() -> None:
    with SessionLocal() as db:
        club = upsert_club(db)
        users_by_email: dict[str, User] = {}

        for account in SEED_ACCOUNTS:
            person = upsert_person(db, account)
            user = upsert_user(db, account, person)
            upsert_membership(db, person, club, account)
            users_by_email[account.email] = user

        upsert_platform_state(
            db,
            superadmin_user=users_by_email["greenlinkgolfsa@gmail.com"],
            club=club,
        )
        db.commit()

    print("Seeded deterministic local auth users.")


def main() -> None:
    seed_users()


if __name__ == "__main__":
    main()
