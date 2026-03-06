from __future__ import annotations

from fastapi import HTTPException

BOOKING_PAYMENT_METHODS = ("CARD", "CASH", "EFT", "ONLINE", "ACCOUNT")
BOOKING_PAYMENT_METHOD_SET = frozenset(BOOKING_PAYMENT_METHODS)

PRO_SHOP_PAYMENT_METHODS = ("card", "cash", "account", "eft")
PRO_SHOP_PAYMENT_METHOD_SET = frozenset(PRO_SHOP_PAYMENT_METHODS)


def normalize_booking_payment_method(
    raw_value: str | None,
    *,
    allow_empty: bool = True,
    field_name: str = "payment_method",
) -> str | None:
    """
    Normalize and validate booking payment methods used by booking/check-in flows.
    """
    value = str(raw_value or "").strip().upper()
    if not value:
        if allow_empty:
            return None
        raise HTTPException(status_code=400, detail=f"{field_name} is required")

    if value not in BOOKING_PAYMENT_METHOD_SET:
        allowed = "/".join(BOOKING_PAYMENT_METHODS)
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}. Use {allowed}")

    return value


def normalize_pro_shop_payment_method(raw_value: str | None) -> str:
    """
    Normalize pro-shop sale payment method labels.
    """
    value = str(raw_value or "").strip().lower()
    if value in PRO_SHOP_PAYMENT_METHOD_SET:
        return value
    return "other"

