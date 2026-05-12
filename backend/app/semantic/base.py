from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session


class Metric(BaseModel):
    """Contract every semantic-layer metric satisfies.

    Subclass and override :meth:`compute`. Each subclass is instantiated once at
    module-import time and registered via :func:`app.semantic.registry.register`.
    Extends the per-method Pydantic response model pattern from
    ``app/services/finance/read_model_service.py``.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True, frozen=True)

    name: str
    description: str
    result_schema: type[BaseModel]
    version: str
    owner: str
    dependencies: list[str]

    def compute(
        self,
        session: Session,
        club_id: uuid.UUID,
        **params: object,
    ) -> BaseModel:
        raise NotImplementedError
