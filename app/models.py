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
    is_primary = Column(Boolean, nullable=False, default=0)
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
    member_number = Column(String(50), nullable=True)
    first_name = Column(String(120), nullable=False)
    last_name = Column(String(120), nullable=False)
    email = Column(String(200), nullable=True, index=True)
    phone = Column(String(50), nullable=True)
    handicap_number = Column(String(50), nullable=True)
    home_club = Column(String(120), nullable=True)
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
    fee_category_id = Column(Integer, ForeignKey("fee_categories.id"), nullable=True)
    price = Column(Float, default=350.0)  # Default green fee
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
