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


class ReadinessStatus(StrEnum):
    READY = "ready"
    WARNING = "warning"
    BLOCKED = "blocked"


class IntegrityIssueSeverity(StrEnum):
    WARNING = "warning"
    BLOCKER = "blocker"


class IntegrityIssueScope(StrEnum):
    PERSON = "person"
    MEMBERSHIP = "membership"
    ACCOUNT_CUSTOMER = "account_customer"


class BulkIntakeAction(StrEnum):
    CREATE_PERSON_CREATE_MEMBERSHIP = "create_person_create_membership"
    MATCH_EXISTING_CREATE_MEMBERSHIP = "match_existing_create_membership"
    MATCH_EXISTING_UPDATE_MEMBERSHIP = "match_existing_update_membership"
    REJECT_ROW = "reject_row"
    WARNING_ONLY = "warning_only"
