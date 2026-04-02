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


class BookingRuleAppliesTo(StrEnum):
    MEMBER = "member"
    GUEST = "guest"
    STAFF = "staff"


class BookingRuleScopeType(StrEnum):
    CLUB = "club"
    COURSE = "course"
    TEE = "tee"
    MEMBERSHIP_ROLE = "membership_role"
    APPLIES_TO_BUCKET = "applies_to_bucket"


class BookingRuleConflictStrategy(StrEnum):
    FIRST_MATCH = "first_match"
    MERGE = "merge"
    OVERRIDE = "override"


class BookingRuleType(StrEnum):
    ADVANCE_WINDOW = "advance_window"
    MAX_BOOKINGS_PER_DAY = "max_bookings_per_day"
    MAX_FUTURE_BOOKINGS = "max_future_bookings"
    GUEST_LIMIT = "guest_limit"
    TIME_RESTRICTION = "time_restriction"


class PricingRuleAppliesTo(StrEnum):
    MEMBER = "member"
    GUEST = "guest"


class PricingDayType(StrEnum):
    WEEKDAY = "weekday"
    WEEKEND = "weekend"
    PUBLIC_HOLIDAY = "public_holiday"


class PricingTimeBand(StrEnum):
    MORNING = "morning"
    AFTERNOON = "afternoon"
    CUSTOM = "custom"


class BookingStatus(StrEnum):
    RESERVED = "reserved"
    CHECKED_IN = "checked_in"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    NO_SHOW = "no_show"


class BookingParticipantType(StrEnum):
    MEMBER = "member"
    GUEST = "guest"
    STAFF = "staff"


class BookingSource(StrEnum):
    ADMIN = "admin"
    MEMBER_PORTAL = "member_portal"
    STAFF = "staff"


class FinanceAccountStatus(StrEnum):
    ACTIVE = "active"
    CLOSED = "closed"


class FinanceTransactionType(StrEnum):
    CHARGE = "charge"
    PAYMENT = "payment"
    ADJUSTMENT = "adjustment"


class FinanceTransactionSource(StrEnum):
    BOOKING = "booking"
    ORDER = "order"
    POS = "pos"
    MANUAL = "manual"


class FinanceExportProfile(StrEnum):
    JOURNAL_BASIC = "journal_basic"


class FinanceExportBatchStatus(StrEnum):
    DRAFT = "draft"
    GENERATED = "generated"
    EXPORTED = "exported"
    VOID = "void"


class OrderSource(StrEnum):
    PLAYER_APP = "player_app"
    STAFF = "staff"


class OrderStatus(StrEnum):
    PLACED = "placed"
    PREPARING = "preparing"
    READY = "ready"
    COLLECTED = "collected"
    CANCELLED = "cancelled"


class TenderType(StrEnum):
    CASH = "cash"
    CARD = "card"
    MEMBER_ACCOUNT = "member_account"


class NewsPostVisibility(StrEnum):
    PUBLIC = "public"
    MEMBERS_ONLY = "members_only"
    INTERNAL = "internal"


class NewsPostStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
