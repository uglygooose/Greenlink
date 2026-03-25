from __future__ import annotations

from typing import Any


_DASHBOARD_VIEW_CONFIG: dict[str, dict[str, Any]] = {
    "legacy_full": {
        "consumers": ["legacy"],
        "fields": None,
    },
    "overview": {
        "consumers": ["club_admin.overview"],
        "fields": None,
    },
    "today": {
        "consumers": ["staff.today"],
        "fields": None,
    },
    "golf_overview": {
        "consumers": ["club_admin.golf.overview", "staff.golf.overview"],
        "fields": {
            "total_bookings",
            "total_players",
            "total_members",
            "golf_revenue_total",
            "golf_revenue_today",
            "golf_revenue_week",
            "golf_day_pipeline_total",
            "golf_day_outstanding_balance",
            "golf_day_open_count",
            "today_bookings",
            "completed_rounds",
            "imports",
            "ai_assistant",
            "targets",
            "operation_insights",
            "revenue_streams",
            "bookings_by_status",
            "bookings_by_status_periods",
            "revenue_boundary",
        },
    },
    "golf_days": {
        "consumers": ["club_admin.golf.golf_days", "staff.golf.golf_days"],
        "fields": {
            "account_customers_active",
            "golf_day_pipeline_total",
            "golf_day_outstanding_balance",
            "golf_day_open_count",
            "total_revenue",
            "golf_revenue_today",
            "imports",
            "ai_assistant",
            "targets",
            "operation_insights",
            "revenue_streams",
            "revenue_boundary",
        },
    },
    "operations_overview": {
        "consumers": ["club_admin.operations.overview", "staff.operations.overview"],
        "fields": None,
    },
    "operations_module": {
        "consumers": ["club_admin.operations.module", "staff.operations.module"],
        "fields": {
            "total_members",
            "total_revenue",
            "today_revenue",
            "week_revenue",
            "golf_revenue_today",
            "pro_shop_revenue_today",
            "other_revenue_today",
            "pro_shop_revenue_total",
            "other_revenue_total",
            "imports",
            "ai_assistant",
            "targets",
            "operation_insights",
            "revenue_streams",
            "revenue_boundary",
        },
    },
    "reports_performance": {
        "consumers": ["club_admin.reports.performance"],
        "fields": {
            "imports",
            "ai_assistant",
            "revenue_streams",
            "revenue_by_status",
            "today_revenue",
            "week_revenue",
            "golf_revenue_total",
            "pro_shop_revenue_total",
        },
    },
}


def normalize_dashboard_view(raw: str | None) -> str:
    value = str(raw or "").strip().lower()
    if not value:
        return "legacy_full"
    return value if value in _DASHBOARD_VIEW_CONFIG else "legacy_full"


def dashboard_cache_key(*, club_id: int, view: str) -> str:
    return f"dashboard:{int(club_id)}:{normalize_dashboard_view(view)}"


def project_dashboard_payload(payload: dict[str, Any], *, view: str) -> dict[str, Any]:
    normalized = normalize_dashboard_view(view)
    config = _DASHBOARD_VIEW_CONFIG[normalized]
    fields = config.get("fields")
    if fields is None:
        projected = dict(payload)
    else:
        allowed = set(fields)
        projected = {key: value for key, value in dict(payload).items() if key in allowed}
    projected["_meta"] = {
        "view": normalized,
        "intended_consumers": list(config.get("consumers") or []),
        "shared_catch_all": False,
    }
    return projected
