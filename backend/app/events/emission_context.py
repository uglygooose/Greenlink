"""Carrier for the audit-log emission identity fields.

Bundles the three values that every domain-event emission needs from the
calling context: who triggered the action, where the call came from, and
the correlation id (when the caller is forwarding one in from a higher
layer).

Routes construct one of these per request and thread it down through the
service method that emits.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class EmissionContext:
    actor_user_id: uuid.UUID | None = None
    source_channel: str = "system"
    correlation_id: str | None = None
