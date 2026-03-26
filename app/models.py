# app/models.py
from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.database import Base

_SQLITE_BIGINT_PK = BigInteger().with_variant(Integer, "sqlite")

class UserRole(str, enum.Enum):
    super_admin = "super_admin"
    admin = "admin"
    club_staff = "club_staff"
    player = "player"

class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    unknown = "unknown"

class PlayerCategory(str, enum.Enum):
    adult = "adult"
    student = "student"
    pensioner = "pensioner"
    junior = "junior"

class Club(Base):
    __tablename__ = "clubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    slug = Column(String(80), nullable=True, unique=True, index=True)
    active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="club")


class SchemaVersion(Base):
    __tablename__ = "schema_versions"

    component = Column(String(80), primary_key=True)
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(30), nullable=False, default="ready")
    details_json = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class PlatformState(Base):
    __tablename__ = "platform_states"

    key = Column(String(120), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(200), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.player)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    person_id = Column(Integer, ForeignKey("people.id"), nullable=True, index=True)
    global_person_id = Column(Integer, ForeignKey("global_person_records.id"), nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    account_type = Column(String(20), nullable=True)  # member | visitor (used for pricing defaults)
    handicap_number = Column(String(50), nullable=True)
    greenlink_id = Column(String(50), unique=True, nullable=True)
    birth_date = Column(DateTime, nullable=True)
    handicap_sa_id = Column(String(50), nullable=True)
    home_course = Column(String(100), nullable=True)
    gender = Column(String(20), nullable=True)  # Gender enum values stored as text for portability.
    player_category = Column(String(20), nullable=True)  # PlayerCategory stored as text.
    student = Column(Boolean, nullable=True)
    handicap_index = Column(Float, nullable=True)

    club = relationship("Club", back_populates="users")


class UserClubAssignment(Base):
    __tablename__ = "user_club_assignments"
    __table_args__ = (
        UniqueConstraint("user_id", "club_id", name="uq_user_club_assignments_user_club"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    role = Column(String(30), nullable=False)
    is_primary = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Person(Base):
    __tablename__ = "people"
    __table_args__ = (
        UniqueConstraint("club_id", "email", name="uq_people_club_email"),
    )

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    first_name = Column(String(120), nullable=False)
    last_name = Column(String(120), nullable=False)
    email = Column(String(200), nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    country_of_residence = Column(String(120), nullable=True)
    gender = Column(String(20), nullable=True)
    status = Column(String(30), nullable=True, index=True)  # active | suspended | inactive | expired | etc
    source_system = Column(String(50), nullable=True, index=True)  # golfscape | manual | user_signup | etc
    source_ref = Column(String(120), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class PersonMembership(Base):
    __tablename__ = "person_memberships"
    __table_args__ = (
        UniqueConstraint("club_id", "person_id", "membership_name", name="uq_person_memberships_person_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    person_id = Column(Integer, ForeignKey("people.id"), nullable=False, index=True)
    membership_name = Column(String(160), nullable=False, index=True)
    membership_group = Column(String(50), nullable=True, index=True)  # golf | bowls | tennis | homeowners | etc
    status = Column(String(30), nullable=True, index=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    is_primary = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class AccountCustomer(Base):
    __tablename__ = "account_customers"
    __table_args__ = (
        UniqueConstraint("club_id", "account_code", name="uq_account_customers_club_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    account_code = Column(String(40), nullable=True, index=True)
    billing_contact = Column(String(160), nullable=True)
    terms_label = Column(String(80), nullable=True)
    terms_days = Column(Integer, nullable=True)
    customer_type = Column(String(60), nullable=True, index=True)
    operation_area = Column(String(120), nullable=True, index=True)
    source_file = Column(String(255), nullable=True)
    import_reference = Column(String(120), nullable=True, index=True)
    active = Column(Integer, default=1)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class GolfDayBooking(Base):
    __tablename__ = "golf_day_bookings"
    __table_args__ = (
        UniqueConstraint(
            "club_id",
            "event_name",
            "event_date_raw",
            "invoice_reference",
            name="uq_golf_day_bookings_identity",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    account_customer_id = Column(Integer, ForeignKey("account_customers.id"), nullable=True, index=True)
    event_name = Column(String(220), nullable=False, index=True)
    event_date = Column(Date, nullable=True, index=True)
    event_end_date = Column(Date, nullable=True, index=True)
    event_date_raw = Column(String(120), nullable=True)
    amount = Column(Float, default=0.0)
    invoice_reference = Column(String(80), nullable=True, index=True)
    deposit_amount = Column(Float, nullable=True)
    deposit_received_date = Column(Date, nullable=True, index=True)
    deposit_received_note = Column(String(200), nullable=True)
    balance_due = Column(Float, nullable=True)
    full_payment_amount = Column(Float, nullable=True)
    full_payment_date = Column(Date, nullable=True, index=True)
    full_payment_note = Column(String(200), nullable=True)
    payment_status = Column(String(30), nullable=True, index=True)  # pending | partial | paid | cancelled
    contact_name = Column(String(160), nullable=True)
    account_code_snapshot = Column(String(40), nullable=True)
    operation_area = Column(String(120), nullable=True, index=True)
    source_file = Column(String(255), nullable=True)
    import_reference = Column(String(120), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    source_import_batch_id = Column(BigInteger, ForeignKey("import_batches.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class StaffRoleProfile(Base):
    __tablename__ = "staff_role_profiles"
    __table_args__ = (
        UniqueConstraint("club_id", "staff_name", "role_label", name="uq_staff_role_profiles_name_role"),
    )

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    staff_name = Column(String(160), nullable=False, index=True)
    role_label = Column(String(120), nullable=False, index=True)
    linked_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    operation_area = Column(String(120), nullable=True, index=True)
    user_type = Column(String(60), nullable=True, index=True)
    source_file = Column(String(255), nullable=True)
    active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Member(Base):
    __tablename__ = "members"
    __table_args__ = (
        UniqueConstraint("club_id", "member_number", name="uq_members_club_member_number"),
        UniqueConstraint("club_id", "email", name="uq_members_club_email"),
    )

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    person_id = Column(Integer, ForeignKey("people.id"), nullable=True, index=True)
    global_person_id = Column(Integer, ForeignKey("global_person_records.id"), nullable=True, index=True)
    member_number = Column(String(50), nullable=True)
    first_name = Column(String(120), nullable=False)
    last_name = Column(String(120), nullable=False)
    email = Column(String(200), nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    handicap_number = Column(String(50), nullable=True)
    home_club = Column(String(120), nullable=True)
    country_of_residence = Column(String(120), nullable=True)
    membership_category = Column(String(160), nullable=True, index=True)
    membership_category_raw = Column(String(160), nullable=True, index=True)
    primary_operation = Column(String(50), nullable=True, index=True)
    membership_status = Column(String(40), nullable=True, index=True)
    member_lifecycle_status = Column(String(40), nullable=True, index=True)
    pricing_mode = Column(String(40), nullable=True, index=True)
    pricing_note = Column(Text, nullable=True)
    pricing_override_updated_at = Column(DateTime, nullable=True)
    pricing_override_updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    record_status = Column(String(40), nullable=True, index=True)
    person_type = Column(String(40), nullable=True, index=True)
    membership_date = Column(Date, nullable=True)
    membership_expiration = Column(Date, nullable=True)
    source_file = Column(String(255), nullable=True)
    source_row_number = Column(Integer, nullable=True, index=True)
    import_reference = Column(String(120), nullable=True, index=True)
    golf_access = Column(Boolean, nullable=True)
    tennis_access = Column(Boolean, nullable=True)
    bowls_access = Column(Boolean, nullable=True)
    squash_access = Column(Boolean, nullable=True)
    active = Column(Integer, default=1)
    gender = Column(String(20), nullable=True)
    player_category = Column(String(20), nullable=True)
    student = Column(Boolean, nullable=True)
    handicap_index = Column(Float, nullable=True)
    handicap_sa_id = Column(String(50), nullable=True)

    bookings = relationship("Booking", back_populates="member")

class TeeTime(Base):
    __tablename__ = "tee_times"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    tee_time = Column(DateTime, nullable=False, index=True)
    hole = Column(String(10), nullable=True)
    capacity = Column(Integer, default=4)
    status = Column(String(20), default="open")  # open/blocked
    available_from = Column(DateTime, nullable=True)
    bookable_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    bookings = relationship("Booking", back_populates="tee_time", cascade="all, delete-orphan")

class BookingStatus(str, enum.Enum):
    booked = "booked"
    checked_in = "checked_in"
    completed = "completed"
    cancelled = "cancelled"
    no_show = "no_show"


class BookingSource(str, enum.Enum):
    proshop = "proshop"
    member = "member"
    external = "external"

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    tee_time_id = Column(Integer, ForeignKey("tee_times.id"))
    member_id = Column(Integer, ForeignKey("members.id"), nullable=True)
    global_person_id = Column(Integer, ForeignKey("global_person_records.id"), nullable=True, index=True)
    club_relationship_state_id = Column(Integer, ForeignKey("club_relationship_states.id"), nullable=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    player_name = Column(String(200), nullable=False)
    player_email = Column(String(200), nullable=True, index=True)
    club_card = Column(String(100), nullable=True)
    handicap_number = Column(String(50), nullable=True)
    greenlink_id = Column(String(50), nullable=True)
    source = Column(Enum(BookingSource), default=BookingSource.proshop)
    external_provider = Column(String(50), nullable=True)
    external_booking_id = Column(String(100), nullable=True)
    # External identifiers for mirroring during parallel runs.
    # - external_booking_id: upstream booking/group reference
    # - external_row_id: unique per-player/line item in upstream export (for idempotent imports)
    external_group_id = Column(String(100), nullable=True)
    external_row_id = Column(String(140), nullable=True)
    party_size = Column(Integer, default=1)
    account_customer_id = Column(Integer, ForeignKey("account_customers.id"), nullable=True, index=True)
    fee_category_id = Column(Integer, ForeignKey("fee_categories.id"), nullable=True)
    price = Column(Float, default=0.0)  # Resolved booking value from pricing matrix or explicit override
    status = Column(Enum(BookingStatus), default=BookingStatus.booked, index=True)
    # Booking-level attributes (snapshotted at booking time for reporting)
    player_type = Column(String(30), nullable=True)  # member | visitor | non_affiliated | reciprocity
    holes = Column(Integer, nullable=True)
    prepaid = Column(Boolean, nullable=True)
    gender = Column(String(20), nullable=True)
    player_category = Column(String(20), nullable=True)
    handicap_sa_id = Column(String(50), nullable=True)
    home_club = Column(String(120), nullable=True)
    handicap_index_at_booking = Column(Float, nullable=True)
    handicap_index_at_play = Column(Float, nullable=True)
    # Requirements captured at booking time
    cart = Column(Boolean, nullable=True)
    push_cart = Column(Boolean, nullable=True)
    caddy = Column(Boolean, nullable=True)
    notes = Column(Text, nullable=True)
    mirrored_at = Column(DateTime, nullable=True)
    capacity_conflict = Column(Boolean, nullable=True)
    import_batch_id = Column(BigInteger, ForeignKey("import_batches.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tee_time = relationship("TeeTime", back_populates="bookings")
    member = relationship("Member", back_populates="bookings")
    round = relationship("Round", uselist=False, back_populates="booking")

class Round(Base):
    __tablename__ = "rounds"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), unique=True)
    scores_json = Column(Text, nullable=True)  # store JSON string of holes/scores
    handicap_sa_round_id = Column(String(100), nullable=True)  # ID from Handicap SA
    handicap_synced = Column(Integer, default=0)
    closed = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    booking = relationship("Booking", back_populates="round")

class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=True)
    description = Column(String(255))
    amount = Column(Float, default=0.0)
    pastel_synced = Column(Integer, default=0)
    pastel_transaction_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    meta = relationship("LedgerEntryMeta", back_populates="ledger_entry", uselist=False, cascade="all, delete-orphan")


class LedgerEntryMeta(Base):
    __tablename__ = "ledger_entry_meta"
    ledger_entry_id = Column(Integer, ForeignKey("ledger_entries.id"), primary_key=True)
    payment_method = Column(String(30), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)

    ledger_entry = relationship("LedgerEntry", back_populates="meta")


class DayClose(Base):
    __tablename__ = "day_closures"
    __table_args__ = (UniqueConstraint("club_id", "close_date", name="uq_day_closures_club_date"),)
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    close_date = Column(Date, index=True, nullable=False)
    status = Column(String(20), default="closed")  # closed/reopened
    closed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    closed_at = Column(DateTime, default=datetime.utcnow)
    reopened_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reopened_at = Column(DateTime, nullable=True)
    export_method = Column(String(50), default="cashbook")
    export_batch_id = Column(String(50), nullable=True)
    export_filename = Column(String(255), nullable=True)
    auto_push = Column(Integer, default=0)


class AccountingSetting(Base):
    __tablename__ = "accounting_settings"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    green_fees_gl = Column(String(50), default="1000-000")
    cashbook_contra_gl = Column(String(50), default="8400/000")
    vat_rate = Column(Float, default=0.15)
    tax_type = Column(Integer, default=1)  # 0=no tax, 1=tax
    cashbook_name = Column(String(120), default="Main Bank")
    updated_at = Column(DateTime, default=datetime.utcnow)


class KpiTarget(Base):
    __tablename__ = "kpi_targets"
    __table_args__ = (UniqueConstraint("club_id", "year", "metric", name="uq_kpi_targets_club_year_metric"),)
    # SQLite only auto-increments when the PK type is exactly INTEGER (rowid alias).
    # Use an Integer variant on SQLite so local/dev DBs can insert targets/import batches/revenue rows.
    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    year = Column(Integer, nullable=False, index=True)
    metric = Column(String(50), nullable=False, index=True)  # "revenue" | "rounds" (extendable)
    annual_target = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ClubSetting(Base):
    __tablename__ = "club_settings"
    club_id = Column(Integer, ForeignKey("clubs.id"), primary_key=True)
    key = Column(String(200), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ClubModuleSetting(Base):
    __tablename__ = "club_module_settings"
    __table_args__ = (
        UniqueConstraint("club_id", "module_key", name="uq_club_module_settings_club_module"),
    )

    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    module_key = Column(String(60), nullable=False, index=True)
    enabled = Column(Boolean, nullable=False, default=True)
    configured_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ClubOperationalTarget(Base):
    __tablename__ = "club_operational_targets"
    __table_args__ = (
        UniqueConstraint(
            "club_id",
            "year",
            "operation_key",
            "metric_key",
            name="uq_club_operational_targets_scope",
        ),
    )

    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    operation_key = Column(String(60), nullable=False, index=True)
    metric_key = Column(String(60), nullable=False, index=True)
    unit = Column(String(30), nullable=True)
    target_value = Column(Float, nullable=False, default=0.0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ImportBatch(Base):
    __tablename__ = "import_batches"
    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    kind = Column(String(50), nullable=False, index=True)  # bookings | revenue | members
    source = Column(String(50), nullable=True, index=True)  # pub | bowls | golfscape | hna | etc.
    file_name = Column(String(255), nullable=True)
    sha256 = Column(String(64), nullable=True)
    imported_at = Column(DateTime, default=datetime.utcnow, index=True)
    rows_total = Column(Integer, default=0)
    rows_inserted = Column(Integer, default=0)
    rows_updated = Column(Integer, default=0)
    rows_failed = Column(Integer, default=0)
    notes = Column(Text, nullable=True)


class RevenueTransaction(Base):
    __tablename__ = "revenue_transactions"
    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    source = Column(String(50), nullable=False, index=True)  # pub | bowls | golf | other
    transaction_date = Column(Date, nullable=False, index=True)
    external_id = Column(String(140), nullable=True, index=True)
    description = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    amount = Column(Float, default=0.0)
    import_batch_id = Column(BigInteger, ForeignKey("import_batches.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProShopProduct(Base):
    __tablename__ = "pro_shop_products"
    __table_args__ = (
        UniqueConstraint("club_id", "sku", name="uq_pro_shop_products_club_sku"),
    )

    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    sku = Column(String(80), nullable=False)
    name = Column(String(200), nullable=False, index=True)
    category = Column(String(120), nullable=True, index=True)
    unit_price = Column(Float, default=0.0)
    cost_price = Column(Float, nullable=True)
    stock_qty = Column(Integer, default=0)
    reorder_level = Column(Integer, default=0)
    active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ProShopSale(Base):
    __tablename__ = "pro_shop_sales"

    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    sold_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    customer_name = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    payment_method = Column(String(30), default="card")
    subtotal = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    tax = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    sold_at = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("ProShopSaleItem", back_populates="sale", cascade="all, delete-orphan")


class ProShopSaleItem(Base):
    __tablename__ = "pro_shop_sale_items"

    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    sale_id = Column(BigInteger, ForeignKey("pro_shop_sales.id"), nullable=False, index=True)
    product_id = Column(BigInteger, ForeignKey("pro_shop_products.id"), nullable=True, index=True)
    sku_snapshot = Column(String(80), nullable=True)
    name_snapshot = Column(String(200), nullable=False)
    category_snapshot = Column(String(120), nullable=True)
    quantity = Column(Integer, default=1)
    unit_price = Column(Float, default=0.0)
    line_total = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    sale = relationship("ProShopSale", back_populates="items")
    product = relationship("ProShopProduct")


class PlayerNotification(Base):
    __tablename__ = "player_notifications"

    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=True, index=True)
    tee_time_id = Column(Integer, ForeignKey("tee_times.id"), nullable=True, index=True)
    kind = Column(String(60), nullable=False, index=True)  # weather_reconfirm | ops_notice | etc
    topic_key = Column(String(120), nullable=True, index=True)  # de-dupe key per campaign/day
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    payload_json = Column(Text, nullable=True)
    status = Column(String(20), default="unread", index=True)  # unread | read | responded | archived
    response = Column(String(40), nullable=True)  # confirm_playing | request_cancel | request_callback
    requires_action = Column(Boolean, default=0)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    read_at = Column(DateTime, nullable=True)
    responded_at = Column(DateTime, nullable=True)


class ClubCommunication(Base):
    __tablename__ = "club_communications"

    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    kind = Column(String(40), nullable=False, index=True)  # news | announcement | message
    audience = Column(String(40), nullable=False, default="members", index=True)  # members | staff | all
    status = Column(String(20), nullable=False, default="draft", index=True)  # draft | published | archived
    title = Column(String(200), nullable=False)
    summary = Column(String(280), nullable=True)
    body = Column(Text, nullable=False)
    cta_label = Column(String(80), nullable=True)
    cta_url = Column(String(255), nullable=True)
    pinned = Column(Boolean, nullable=False, default=False)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    published_at = Column(DateTime, nullable=True, index=True)
    expires_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(120), nullable=False, index=True)
    entity_type = Column(String(80), nullable=True, index=True)
    entity_id = Column(String(120), nullable=True, index=True)
    request_id = Column(String(64), nullable=True, index=True)
    payload_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class GlobalPersonRecord(Base):
    __tablename__ = "global_person_records"

    id = Column(Integer, primary_key=True, index=True)
    canonical_name = Column(String(240), nullable=False, index=True)
    first_name = Column(String(120), nullable=True, index=True)
    last_name = Column(String(120), nullable=True, index=True)
    email = Column(String(200), nullable=True, unique=True, index=True)
    phone = Column(String(50), nullable=True, index=True)
    provenance_json = Column(Text, nullable=True)
    dedupe_status = Column(String(30), nullable=False, default="trusted", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, index=True)


class ClubRelationshipState(Base):
    __tablename__ = "club_relationship_states"
    __table_args__ = (
        UniqueConstraint("club_id", "global_person_id", name="uq_club_relationship_states_club_person"),
    )

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    global_person_id = Column(Integer, ForeignKey("global_person_records.id"), nullable=False, index=True)
    relationship_type = Column(String(40), nullable=False, default="visitor", index=True)
    membership_type = Column(String(160), nullable=True, index=True)
    pricing_group = Column(String(80), nullable=True, index=True)
    status = Column(String(40), nullable=False, default="active", index=True)
    privileges_json = Column(Text, nullable=True)
    booking_eligibility = Column(String(30), nullable=False, default="allowed", index=True)
    communication_eligibility = Column(String(30), nullable=False, default="allowed", index=True)
    revenue_linkage_state = Column(String(30), nullable=False, default="unlinked", index=True)
    source_system = Column(String(50), nullable=True, index=True)
    source_ref = Column(String(120), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, index=True)


class OperationalException(Base):
    __tablename__ = "operational_exceptions"
    __table_args__ = (
        UniqueConstraint("club_id", "dedupe_key", name="uq_operational_exceptions_club_key"),
    )

    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=False, index=True)
    dedupe_key = Column(String(180), nullable=False, index=True)
    exception_type = Column(String(80), nullable=False, index=True)
    severity = Column(String(20), nullable=False, default="medium", index=True)
    blocking_surface = Column(String(80), nullable=False, index=True)
    source_domain = Column(String(80), nullable=False, index=True)
    owner_role = Column(String(40), nullable=False, default="admin", index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    state = Column(String(20), nullable=False, default="open", index=True)
    next_required_action = Column(String(200), nullable=True)
    summary = Column(String(255), nullable=False)
    linked_record_refs_json = Column(Text, nullable=True)
    details_json = Column(Text, nullable=True)
    ai_suggestion_json = Column(Text, nullable=True)
    freshness_at = Column(DateTime, nullable=True, index=True)
    due_at = Column(DateTime, nullable=True, index=True)
    audit_ref = Column(String(120), nullable=True, index=True)
    opened_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, index=True)
    resolved_at = Column(DateTime, nullable=True, index=True)


class TaskTimingEvent(Base):
    __tablename__ = "task_timing_events"

    id = Column(_SQLITE_BIGINT_PK, primary_key=True, index=True, autoincrement=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    task_key = Column(String(80), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="success", index=True)
    duration_ms = Column(Integer, nullable=False, default=0)
    actor_role = Column(String(40), nullable=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    request_id = Column(String(64), nullable=True, index=True)
    meta_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
