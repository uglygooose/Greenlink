from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time as Time
import re
from typing import Any, Iterable, Optional

from sqlalchemy import or_
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


def infer_gender_from_values(*values: Any) -> Optional[str]:
    for value in values:
        raw = _normalize_str(str(value or ""))
        if not raw:
            continue
        compact = re.sub(r"[^a-z]+", " ", raw)
        if any(token in compact for token in (" men ", " mens ", " gentleman ", " gentlemen ", " male ")):
            return "male"
        if any(token in compact for token in (" ladies ", " lady ", " women ", " womens ", " female ")):
            return "female"
        if compact.startswith("men ") or compact.startswith("mens "):
            return "male"
        if compact.startswith("ladies ") or compact.startswith("lady ") or compact.startswith("women "):
            return "female"
    return None


def normalize_player_type(value: Optional[str]) -> Optional[str]:
    value = _normalize_str(value)
    if not value:
        return None
    if value in {"member", "m", "club_member", "club member", "home_member", "home member", "host_member", "host member"}:
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


def normalize_member_pricing_mode(value: Optional[str]) -> str:
    raw = _normalize_str(value) or "membership_default"
    aliases = {
        "default": "membership_default",
        "membership": "membership_default",
        "membership_default": "membership_default",
        "visitor": "visitor_override",
        "visitor_override": "visitor_override",
        "charge_visitor": "visitor_override",
        "non_affiliated": "non_affiliated_override",
        "non_affiliated_override": "non_affiliated_override",
        "non-affiliated_override": "non_affiliated_override",
        "reciprocity": "reciprocity_override",
        "reciprocity_override": "reciprocity_override",
    }
    return aliases.get(raw, "membership_default")


def pricing_mode_to_player_type(mode: Optional[str]) -> Optional[str]:
    normalized = normalize_member_pricing_mode(mode)
    mapping = {
        "membership_default": None,
        "visitor_override": "visitor",
        "non_affiliated_override": "non_affiliated",
        "reciprocity_override": "reciprocity",
    }
    return mapping.get(normalized)


def default_player_type_for_membership(membership_name: Optional[str]) -> Optional[str]:
    raw = _normalize_str(membership_name)
    if not raw:
        return None

    visitor_terms = (
        "visitor",
        "guest",
        "home owner",
        "homeowner",
        "social",
        "non golf",
        "non-golf",
        "house",
        "spouse",
        "local",
        "out of natal",
        "pmg",
    )
    member_terms = (
        "member",
        "golf",
        "weekday",
        "academy",
        "junior",
        "student",
        "scholar",
        "supplementary",
        "supp ",
        "life",
        "veteran",
        "full",
    )

    if "reciprocity" in raw:
        return "reciprocity"
    if any(term in raw for term in visitor_terms):
        return "visitor"
    if any(term in raw for term in member_terms):
        return "member"
    return None


def pricing_tags_from_values(*values: Any) -> tuple[str, ...]:
    tags: set[str] = set()
    for value in values:
        raw = _normalize_str(str(value or ""))
        if not raw:
            continue
        if "pob" in raw or "weekday" in raw:
            tags.add("weekday_member")
        if "student" in raw:
            tags.add("student")
        if "scholar" in raw:
            tags.add("scholar")
            tags.add("junior")
        if "junior" in raw or "academy" in raw:
            tags.add("junior")
        if "pensioner" in raw or "veteran" in raw or "60yr" in raw or "60 yr" in raw:
            tags.add("pensioner")
        if "pmg" in raw:
            tags.add("pmg")
        if "caddie" in raw or "caddy" in raw:
            tags.add("caddie")
    return tuple(sorted(tags))


def inferred_age_from_tags(tags: Iterable[str]) -> Optional[int]:
    normalized = {str(tag or "").strip().lower() for tag in tags if str(tag or "").strip()}
    if "pensioner" in normalized:
        return 60
    return None


def day_kind_for_datetime(dt: datetime) -> str:
    return "weekend" if dt.weekday() >= 5 else "weekday"


def compute_age(on_date: date, birth_date: date) -> int:
    return on_date.year - birth_date.year - ((on_date.month, on_date.day) < (birth_date.month, birth_date.day))


def _time_value(value: Any) -> Optional[Time]:
    if value is None:
        return None
    if isinstance(value, Time):
        return value
    try:
        raw = str(value or "").strip()
        if not raw:
            return None
        parts = raw.split(":")
        if len(parts) < 2:
            return None
        return Time(hour=int(parts[0]), minute=int(parts[1]))
    except Exception:
        return None


@dataclass(frozen=True)
class PricingContext:
    fee_type: FeeType
    tee_time: datetime
    player_type: Optional[str] = None
    gender: Optional[str] = None
    holes: int = 18
    age: Optional[int] = None
    pricing_tags: tuple[str, ...] = ()

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

    tee_date = ctx.tee_time.date()
    if fee.start_date is not None and tee_date < fee.start_date:
        return False
    if fee.end_date is not None and tee_date > fee.end_date:
        return False

    if fee.start_time is not None or fee.end_time is not None:
        tee_time_value = ctx.tee_time.time().replace(second=0, microsecond=0)
        start_time = _time_value(getattr(fee, "start_time", None))
        end_time = _time_value(getattr(fee, "end_time", None))
        if start_time is not None and end_time is not None:
            if start_time <= end_time:
                if tee_time_value < start_time or tee_time_value > end_time:
                    return False
            elif tee_time_value < start_time and tee_time_value > end_time:
                return False
        elif start_time is not None and tee_time_value < start_time:
            return False
        elif end_time is not None and tee_time_value > end_time:
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
    if fee.start_date is not None or fee.end_date is not None:
        score += 8
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
    if fee.start_time is not None or fee.end_time is not None:
        score += 2
    return score


def _special_tag_keywords() -> dict[str, tuple[str, ...]]:
    return {
        "weekday_member": ("pob",),
        "student": ("student",),
        "scholar": ("scholar",),
        "junior": ("junior", "academy"),
        "pensioner": ("pensioner", "veteran"),
        "pmg": ("pmg",),
        "caddie": ("caddie", "caddy"),
    }


def _fee_requires_special_tag(description: str, ctx_tags: set[str]) -> bool:
    for tag, keywords in _special_tag_keywords().items():
        if any(keyword in description for keyword in keywords) and tag not in ctx_tags:
            return True
    return False


def select_best_fee_from_list(
    fees: Iterable[FeeCategory],
    ctx: PricingContext,
) -> Optional[FeeCategory]:
    best: Optional[FeeCategory] = None
    best_score: Optional[int] = None
    ctx_tags = {str(tag or "").strip().lower() for tag in (ctx.pricing_tags or ()) if str(tag or "").strip()}

    for fee in fees:
        if not _matches(ctx, fee):
            continue

        desc = (fee.description or "").strip().lower()
        if _fee_requires_special_tag(desc, ctx_tags):
            continue

        priority = int(getattr(fee, "priority", 0) or 0)
        score = priority * 100 + _specificity_score(fee)

        for tag, keywords in _special_tag_keywords().items():
            if tag in ctx_tags and any(keyword in desc for keyword in keywords):
                score += 100

        if ctx.player_type:
            if fee.audience is None:
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
    club_id = getattr(db, "info", {}).get("club_id") or None
    if club_id:
        query = query.filter(or_(FeeCategory.club_id == int(club_id), FeeCategory.club_id.is_(None)))
    return select_best_fee_from_list(query.all(), ctx)


@dataclass(frozen=True)
class BookingPricingProfile:
    player_type: Optional[str]
    age: Optional[int]
    pricing_mode: str
    pricing_source: str
    pricing_tags: tuple[str, ...] = ()


def resolve_booking_pricing_profile(
    *,
    tee_time: datetime,
    explicit_player_type: Optional[str] = None,
    member: Any = None,
    membership_category: Optional[str] = None,
    user_account_type: Optional[str] = None,
    player_category: Optional[str] = None,
    birth_date: Optional[date] = None,
    age: Optional[int] = None,
    has_member_link: bool = False,
    handicap_sa_id: Optional[str] = None,
    home_club: Optional[str] = None,
) -> BookingPricingProfile:
    pricing_tags = pricing_tags_from_values(membership_category, player_category)

    resolved_age = age
    if resolved_age is None and birth_date is not None:
        resolved_age = compute_age(tee_time.date(), birth_date)
    if resolved_age is None:
        resolved_age = inferred_age_from_tags(pricing_tags)

    player_type = normalize_player_type(explicit_player_type)
    pricing_mode = "membership_default"
    if player_type:
        return BookingPricingProfile(
            player_type=player_type,
            age=resolved_age,
            pricing_mode=pricing_mode,
            pricing_source="explicit",
            pricing_tags=pricing_tags,
        )

    if member is not None:
        pricing_mode = normalize_member_pricing_mode(getattr(member, "pricing_mode", None))
        override_player_type = pricing_mode_to_player_type(pricing_mode)
        if override_player_type:
            return BookingPricingProfile(
                player_type=override_player_type,
                age=resolved_age,
                pricing_mode=pricing_mode,
                pricing_source="member_override",
                pricing_tags=pricing_tags,
            )

        membership_text = (
            membership_category
            or getattr(member, "membership_category_raw", None)
            or getattr(member, "membership_category", None)
        )
        membership_player_type = default_player_type_for_membership(membership_text)
        if membership_player_type:
            return BookingPricingProfile(
                player_type=membership_player_type,
                age=resolved_age,
                pricing_mode=pricing_mode,
                pricing_source="membership_default",
                pricing_tags=pricing_tags_from_values(membership_text, player_category),
            )
        if has_member_link or getattr(member, "id", None):
            return BookingPricingProfile(
                player_type="member",
                age=resolved_age,
                pricing_mode=pricing_mode,
                pricing_source="membership_default",
                pricing_tags=pricing_tags,
            )

    user_player_type = normalize_player_type(user_account_type)
    if user_player_type:
        return BookingPricingProfile(
            player_type=user_player_type,
            age=resolved_age,
            pricing_mode=pricing_mode,
            pricing_source="account_type",
            pricing_tags=pricing_tags,
        )

    membership_player_type = default_player_type_for_membership(membership_category)
    if membership_player_type:
        return BookingPricingProfile(
            player_type=membership_player_type,
            age=resolved_age,
            pricing_mode=pricing_mode,
            pricing_source="membership_label",
            pricing_tags=pricing_tags_from_values(membership_category, player_category),
        )

    if handicap_sa_id or home_club:
        return BookingPricingProfile(
            player_type="visitor",
            age=resolved_age,
            pricing_mode=pricing_mode,
            pricing_source="affiliated_fallback",
            pricing_tags=pricing_tags,
        )

    return BookingPricingProfile(
        player_type="non_affiliated",
        age=resolved_age,
        pricing_mode=pricing_mode,
        pricing_source="default_fallback",
        pricing_tags=pricing_tags,
    )
