from __future__ import annotations

from enum import StrEnum


class UserType(StrEnum):
    SUPERADMIN = "superadmin"
    USER = "user"


class ClubMembershipRole(StrEnum):
    CLUB_ADMIN = "club_admin"
    CLUB_STAFF = "club_staff"
    MEMBER = "member"


class ClubMembershipStatus(StrEnum):
    ACTIVE = "active"
    INVITED = "invited"
    SUSPENDED = "suspended"
    INACTIVE = "inactive"
