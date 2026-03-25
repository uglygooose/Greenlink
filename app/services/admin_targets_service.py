from __future__ import annotations

from typing import Any, Callable

from sqlalchemy.orm import Session

from app.services.kpi_targets_service import (
    KpiTargetUpsertPayload,
    TargetAssumptionsPayload,
    update_target_assumptions_payload,
    upsert_kpi_target_payload,
)
from app.services.operational_targets_service import (
    OperationalTargetUpsertPayload,
    upsert_operational_target_settings_payload,
)

AuditEventWriter = Callable[..., None]
CacheInvalidator = Callable[[int | None], None]


def upsert_kpi_target_command(
    db: Session,
    *,
    club_id: int,
    payload: KpiTargetUpsertPayload,
    audit_event: AuditEventWriter | None = None,
    invalidate_admin_caches: CacheInvalidator | None = None,
) -> dict[str, Any]:
    result = upsert_kpi_target_payload(
        db,
        club_id=int(club_id),
        payload=payload,
    )
    if audit_event is not None:
        audit_event(
            action="kpi_target.upserted",
            entity_type="kpi_target",
            entity_id=f"{int(result['year'])}:{str(result['metric'])}",
            payload={
                "year": int(result["year"]),
                "metric": str(result["metric"]),
                "annual_target": float(result["annual_target"]),
            },
        )
    db.commit()
    if invalidate_admin_caches is not None:
        invalidate_admin_caches(int(club_id))
    return result


def update_target_assumptions_command(
    db: Session,
    *,
    club_id: int | None,
    payload: TargetAssumptionsPayload,
    audit_event: AuditEventWriter | None = None,
    invalidate_admin_caches: CacheInvalidator | None = None,
) -> dict[str, Any]:
    result = update_target_assumptions_payload(
        db,
        payload=payload,
    )
    if audit_event is not None:
        audit_event(
            action="kpi_target.assumptions_updated",
            entity_type="kpi_target",
            entity_id=f"{int(result['year'])}:assumptions",
            payload={
                "year": int(result["year"]),
                "member_round_share": float((result.get("assumptions") or {}).get("member_round_share") or 0.0),
                "member_revenue_share": float((result.get("assumptions") or {}).get("member_revenue_share") or 0.0),
                "revenue_mode": str(result.get("revenue_mode") or "derived"),
            },
        )
    db.commit()
    if invalidate_admin_caches is not None:
        invalidate_admin_caches(int(club_id) if club_id is not None and int(club_id) > 0 else None)
    return result


def upsert_operational_target_settings_command(
    db: Session,
    *,
    club_id: int,
    payload: OperationalTargetUpsertPayload,
    audit_event: AuditEventWriter | None = None,
    invalidate_admin_caches: CacheInvalidator | None = None,
) -> dict[str, Any]:
    result = upsert_operational_target_settings_payload(
        db,
        club_id=int(club_id),
        year=int(payload.year),
        rows=[row.model_dump(exclude_none=True) for row in list(payload.targets or [])],
    )
    if audit_event is not None:
        audit_event(
            action="club_operational_targets.upserted",
            entity_type="club_operational_target",
            entity_id=f"{int(club_id)}:{int(result['year'])}",
            payload={"year": int(result["year"]), "count": len(result["targets"])},
        )
    db.commit()
    if invalidate_admin_caches is not None:
        invalidate_admin_caches(int(club_id))
    return result
