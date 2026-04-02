from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class AccountingExportProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "accounting_export_profiles"
    __table_args__ = (
        UniqueConstraint("club_id", "code", name="uq_accounting_export_profiles_club_code"),
    )

    club_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clubs.id", ondelete="CASCADE"),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    target_system: Mapped[str] = mapped_column(String(64), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    mapping_config_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_by_person_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("people.id", ondelete="RESTRICT"),
        nullable=False,
    )
