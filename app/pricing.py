from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.fee_models import FeeCategory, FeeType


def _normalize_str(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip().lower()
    return value or None


def normalize_gender(value: Optional[str]) -> Optional[str]:
    value = _normalize_str(value)
    if not value:
        return None
    if value in {"m", "male", "man"}:
        return "male"
    if value in {"f", "female", "woman"}:
        return "female"
    return value


def normalize_player_type(value: Optional[str]) -> Optional[str]:
    value = _normalize_str(value)
    if not value:
        return None
    # Canonical values in the DB (FeeCategory.audience) are currently:
    # - "member" (club member)
    # - "visitor" (affiliated visitor)
    # - "non_affiliated" (non-affiliated visitor)
    # Keep these stable, and accept broader UI-friendly aliases.
    if value in {"member", "m", "club_member", "club member", "home_member", "home member", "umhlali_member", "umhlali member"}:
        return "member"
    if value in {"visitor", "v", "guest", "affiliated", "affiliated_visitor", "affiliated visitor"}:
        return "visitor"
    if value in {"non_affiliated", "non-affiliated", "non affiliated", "nonaffiliated"}:
        return "non_affiliated"
    if value in {"non_affiliated_visitor", "non-affiliated visitor", "non affiliated visitor"}:
        return "non_affiliated"
    if value in {"reciprocity"}:
        return "reciprocity"
    return value


def day_kind_for_datetime(dt: datetime) -> str:
    # Python weekday(): Monday=0 ... Sunday=6
    return "weekend" if dt.weekday() >= 5 else "weekday"


def compute_age(on_date: date, birth_date: date) -> int:
    return on_date.year - birth_date.year - (
        (on_date.month, on_date.day) < (birth_date.month, birth_date.day)
    )


@dataclass(frozen=True)
class PricingContext:
    fee_type: FeeType
    tee_time: datetime
    player_type: Optional[str] = None
    gender: Optional[str] = None
    holes: int = 18
    age: Optional[int] = None

    @property
    def day_kind(self) -> str:
        return day_kind_for_datetime(self.tee_time)

    @property
    def weekday(self) -> int:
        return self.tee_time.weekday()


def _matches(ctx: PricingContext, fee: FeeCategory) -> bool:
    if fee.active != 1:
        return False
    if fee.fee_type != ctx.fee_type:
        return False

    if fee.audience is not None:
        if not ctx.player_type:
            return False
        if _normalize_str(fee.audience) != ctx.player_type:
            return False

    if fee.day_kind is not None and _normalize_str(fee.day_kind) != ctx.day_kind:
        return False

    if fee.weekday is not None and int(fee.weekday) != int(ctx.weekday):
        return False

    if fee.holes is not None and int(fee.holes) != int(ctx.holes):
        return False

    if fee.gender is not None:
        if not ctx.gender:
            return False
        if _normalize_str(fee.gender) != ctx.gender:
            return False

    if fee.min_age is not None or fee.max_age is not None:
        if ctx.age is None:
            return False
        if fee.min_age is not None and ctx.age < int(fee.min_age):
            return False
        if fee.max_age is not None and ctx.age > int(fee.max_age):
            return False

    return True


def _specificity_score(fee: FeeCategory) -> int:
    score = 0
    if fee.audience is not None:
        score += 10
    if fee.day_kind is not None:
        score += 6
    if fee.weekday is not None:
        score += 5
    if fee.holes is not None:
        score += 4
    if fee.gender is not None:
        score += 3
    if fee.min_age is not None or fee.max_age is not None:
        score += 2
    return score


def select_best_fee_from_list(
    fees: Iterable[FeeCategory],
    ctx: PricingContext,
) -> Optional[FeeCategory]:
    best: Optional[FeeCategory] = None
    best_score: Optional[int] = None

    for fee in fees:
        if not _matches(ctx, fee):
            continue

        # Priority dominates; specificity breaks ties.
        priority = int(getattr(fee, "priority", 0) or 0)
        score = priority * 100 + _specificity_score(fee)

        # Heuristic: when cart fees don't have audience tags populated yet,
        # infer member vs visitor from wording.
        if ctx.player_type:
            desc = (fee.description or "").strip().lower()
            if fee.audience is None:
                # Golf fees: clubs often include "Member", "Affiliated", "Non-affiliated" in the description.
                if ctx.fee_type == FeeType.GOLF:
                    is_member = "member" in desc
                    is_non_aff = ("non-affiliated" in desc) or ("non affiliated" in desc) or ("nonaffiliated" in desc)
                    is_aff = ("affiliated" in desc) and not is_non_aff

                    if ctx.player_type == "member":
                        score += 6 if is_member else 0
                        score -= 4 if (is_aff or is_non_aff) else 0
                    elif ctx.player_type == "visitor":
                        score += 6 if is_aff else 0
                        score -= 4 if is_non_aff else 0
                    elif ctx.player_type == "non_affiliated":
                        score += 6 if is_non_aff else 0
                        score -= 4 if is_aff else 0

                # Cart fees: older tables sometimes encode member vs visitor via "hire" wording.
                if ctx.fee_type == FeeType.CART:
                    has_hire = "hire" in desc
                    if ctx.player_type == "visitor":
                        score += 2 if has_hire else 0
                    elif ctx.player_type == "member":
                        score += 2 if not has_hire else -2

        if best_score is None or score > best_score:
            best = fee
            best_score = score
        elif score == best_score and best is not None:
            # If two fees are otherwise identical (same name), assume higher price is weekend,
            # and lower price is weekday.
            if _normalize_str(fee.description) == _normalize_str(best.description):
                try:
                    fee_price = float(getattr(fee, "price", 0) or 0)
                    best_price = float(getattr(best, "price", 0) or 0)
                except Exception:
                    continue
                if ctx.day_kind == "weekend":
                    if fee_price > best_price:
                        best = fee
                else:
                    if fee_price < best_price:
                        best = fee

    return best


def select_best_fee_category(db: Session, ctx: PricingContext) -> Optional[FeeCategory]:
    query = db.query(FeeCategory).filter(
        FeeCategory.active == 1,
        FeeCategory.fee_type == ctx.fee_type,
    )
    return select_best_fee_from_list(query.all(), ctx)
