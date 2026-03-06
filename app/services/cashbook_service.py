from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Callable

from fastapi import HTTPException


@dataclass
class DailyJournalBuildResult:
    lines: list[dict[str, Any]]
    gross_total: Decimal
    net_total: Decimal
    vat_total: Decimal
    rate: Decimal
    batch_ref: str
    batch_desc: str
    ledger_entry_ids: list[int]
    booking_ids: list[int]


def q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def to_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except Exception:
        return Decimal("0")


def build_daily_journal_lines(
    *,
    rows: list[tuple[Any, Any, Any, Any]],
    settings: Any,
    mappings: dict[str, Any],
    target_date: date,
    clean_text: Callable[[str, int], str],
) -> DailyJournalBuildResult:
    # Validate payment_method presence.
    missing_pm: list[int] = []
    for _le, booking, _fee_cat, meta in rows:
        method = str(getattr(meta, "payment_method", "") or "").strip().upper()
        if not method:
            missing_pm.append(int(getattr(booking, "id", 0) or 0))
    missing_pm = [bid for bid in missing_pm if bid]
    if missing_pm:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Missing payment method for {len(missing_pm)} booking(s): {', '.join([str(x) for x in missing_pm[:30]])}. "
                "Fix by checking-in those bookings with a payment method (CARD/CASH/EFT/ONLINE/ACCOUNT) "
                "or backfill test data locally."
            ),
        )

    debit_gl = mappings.get("debit_gl") or {}

    # Aggregate gross totals.
    gross_by_method: dict[str, Decimal] = {}
    gross_by_account_code: dict[str, Decimal] = {}
    unassigned_account_booking_ids: list[int] = []
    gross_by_fee_type: dict[str, Decimal] = {}
    ledger_entry_ids: list[int] = []
    booking_ids: list[int] = []

    for ledger_entry, booking, fee_cat, meta in rows:
        amount = q2(to_decimal(getattr(ledger_entry, "amount", 0) or 0))
        if amount <= 0:
            continue

        method = str(getattr(meta, "payment_method", "") or "").strip().upper()
        fee_type_raw = getattr(fee_cat, "fee_type", None)
        fee_type = str(getattr(fee_type_raw, "value", fee_type_raw) or "golf").strip().lower() or "golf"

        gross_by_method[method] = q2(gross_by_method.get(method, Decimal("0")) + amount)
        if method == "ACCOUNT":
            account_code = str(getattr(booking, "club_card", "") or "").strip()
            if account_code:
                gross_by_account_code[account_code] = q2(gross_by_account_code.get(account_code, Decimal("0")) + amount)
            else:
                booking_id = int(getattr(booking, "id", 0) or 0)
                if booking_id:
                    unassigned_account_booking_ids.append(booking_id)
        gross_by_fee_type[fee_type] = q2(gross_by_fee_type.get(fee_type, Decimal("0")) + amount)

        if getattr(ledger_entry, "id", None):
            ledger_entry_ids.append(int(ledger_entry.id))
        if getattr(booking, "id", None):
            booking_ids.append(int(booking.id))

    if not gross_by_method:
        raise HTTPException(status_code=404, detail=f"No positive-value payments found for {target_date}")

    used_methods = sorted(gross_by_method.keys())
    missing_debits = [m for m in used_methods if m != "ACCOUNT" and not str(debit_gl.get(m, "") or "").strip()]
    account_fallback_gl = str(debit_gl.get("ACCOUNT", "") or "").strip()
    if "ACCOUNT" in used_methods and not account_fallback_gl and unassigned_account_booking_ids:
        missing_debits.append("ACCOUNT")
    if missing_debits:
        raise HTTPException(status_code=400, detail=f"Missing debit GL mapping for payment method(s): {', '.join(missing_debits)}")

    # VAT calculations (inclusive amounts) using transaction-level rounding.
    try:
        rate = Decimal(str(settings.vat_rate if getattr(settings, "vat_rate", None) is not None else 0.15))
    except Exception:
        rate = Decimal("0.15")
    if rate < 0:
        rate = Decimal("0")

    vat_by_fee_type: dict[str, Decimal] = {k: Decimal("0.00") for k in gross_by_fee_type.keys()}
    net_by_fee_type: dict[str, Decimal] = {k: Decimal("0.00") for k in gross_by_fee_type.keys()}

    for ledger_entry, _booking, fee_cat, _meta in rows:
        gross = q2(to_decimal(getattr(ledger_entry, "amount", 0) or 0))
        if gross <= 0:
            continue
        fee_type_raw = getattr(fee_cat, "fee_type", None)
        fee_type = str(getattr(fee_type_raw, "value", fee_type_raw) or "golf").strip().lower() or "golf"
        if rate > 0:
            vat = q2(gross * (rate / (Decimal("1") + rate)))
        else:
            vat = Decimal("0.00")
        net = q2(gross - vat)
        vat_by_fee_type[fee_type] = q2(vat_by_fee_type.get(fee_type, Decimal("0.00")) + vat)
        net_by_fee_type[fee_type] = q2(net_by_fee_type.get(fee_type, Decimal("0.00")) + net)

    vat_total = q2(sum(vat_by_fee_type.values(), Decimal("0.00")))
    net_total = q2(sum(net_by_fee_type.values(), Decimal("0.00")))
    gross_total = q2(sum(gross_by_method.values(), Decimal("0")))
    if q2(net_total + vat_total) != gross_total:
        raise HTTPException(status_code=500, detail="VAT split does not balance to gross total after rounding.")

    batch_ref = f"GREENLINK_{target_date.strftime('%Y%m%d')}"
    batch_desc = clean_text(f"Daily golf takings {target_date.strftime('%Y-%m-%d')}", max_len=60)

    lines: list[dict[str, Any]] = []
    method_order = ["CASH", "CARD", "EFT", "ONLINE", "ACCOUNT"]
    ordered_methods = [m for m in method_order if m in gross_by_method] + [m for m in used_methods if m not in method_order]
    for method in ordered_methods:
        if method == "ACCOUNT":
            continue
        account = str(debit_gl.get(method) or "").strip()
        lines.append(
            {
                "account": account,
                "debit": gross_by_method[method],
                "credit": Decimal("0.00"),
                "ref": clean_text(method, max_len=20),
                "desc": clean_text(f"{batch_desc} {method}", max_len=60),
            }
        )

    if "ACCOUNT" in gross_by_method:
        allocated = Decimal("0.00")
        for account_code in sorted(gross_by_account_code.keys()):
            amount = q2(gross_by_account_code.get(account_code, Decimal("0.00")))
            if amount == 0:
                continue
            allocated = q2(allocated + amount)
            lines.append(
                {
                    "account": account_code,
                    "debit": amount,
                    "credit": Decimal("0.00"),
                    "ref": clean_text(f"ACC {account_code}", max_len=20),
                    "desc": clean_text(f"{batch_desc} ACCOUNT {account_code}", max_len=60),
                }
            )

        remainder = q2(gross_by_method.get("ACCOUNT", Decimal("0.00")) - allocated)
        if remainder != 0:
            fallback_account = account_fallback_gl
            if not fallback_account:
                sample = ", ".join(str(x) for x in unassigned_account_booking_ids[:20])
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "ACCOUNT payments require either booking account codes (Booking -> Debtor account) "
                        "or an ACCOUNT debit GL mapping. "
                        f"Bookings missing account code: {sample}"
                    ),
                )
            lines.append(
                {
                    "account": fallback_account,
                    "debit": remainder,
                    "credit": Decimal("0.00"),
                    "ref": "ACCOUNT",
                    "desc": clean_text(f"{batch_desc} ACCOUNT", max_len=60),
                }
            )

    revenue_gl_default = (getattr(settings, "green_fees_gl", None) or "").strip()
    revenue_by_fee_type = (mappings.get("revenue_gl") or {}) if isinstance(mappings.get("revenue_gl"), dict) else {}
    for fee_type in sorted(net_by_fee_type.keys()):
        net_amount = net_by_fee_type[fee_type]
        if net_amount == 0:
            continue
        account = str(revenue_by_fee_type.get(fee_type) or revenue_gl_default or "").strip()
        if not account:
            raise HTTPException(status_code=400, detail=f"Missing revenue GL mapping for fee type '{fee_type}'.")
        lines.append(
            {
                "account": account,
                "debit": Decimal("0.00"),
                "credit": net_amount,
                "ref": clean_text(str(fee_type).upper(), max_len=20),
                "desc": clean_text(f"{batch_desc} {fee_type}", max_len=60),
                "vat": vat_by_fee_type.get(fee_type, Decimal("0.00")),
            }
        )

    vat_output_gl = str(mappings.get("vat_output_gl") or "").strip()
    if vat_total != 0:
        lines.append(
            {
                "account": vat_output_gl,
                "debit": Decimal("0.00"),
                "credit": vat_total,
                "ref": "VAT CONT",
                "desc": clean_text(f"Output VAT {target_date.strftime('%Y-%m-%d')}", max_len=60),
            }
        )

    debit_sum = q2(sum((line["debit"] for line in lines), Decimal("0")))
    credit_sum = q2(sum((line["credit"] for line in lines), Decimal("0")))
    if debit_sum != credit_sum:
        raise HTTPException(status_code=500, detail="Journal is out of balance after rounding.")

    return DailyJournalBuildResult(
        lines=lines,
        gross_total=gross_total,
        net_total=net_total,
        vat_total=vat_total,
        rate=rate,
        batch_ref=batch_ref,
        batch_desc=batch_desc,
        ledger_entry_ids=ledger_entry_ids,
        booking_ids=booking_ids,
    )
