from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from app.fee_models import FeeCategory, FeeType
from app.pricing import (
    PricingContext,
    resolve_booking_pricing_profile,
    select_best_fee_from_list,
)
from app.services.imports_service import parse_tee_sheet_csv


def test_standard_member_weekday_does_not_pick_weekday_membership_fee():
    fees = [
        FeeCategory(
            code=1,
            description="GOLF MEMBER MEN - 18 HOLES",
            price=340,
            fee_type=FeeType.GOLF,
            active=1,
            audience="member",
            gender="male",
            holes=18,
        ),
        FeeCategory(
            code=7,
            description="GOLF MEMBER POB MEN (MON FULL DAY + TUES-FRI AM) 18 HOLES",
            price=290,
            fee_type=FeeType.GOLF,
            active=1,
            audience="member",
            gender="male",
            holes=18,
            day_kind="weekday",
            priority=5,
        ),
    ]

    best = select_best_fee_from_list(
        fees,
        PricingContext(
            fee_type=FeeType.GOLF,
            tee_time=datetime(2026, 3, 10, 6, 46),
            player_type="member",
            gender="male",
            holes=18,
            pricing_tags=(),
        ),
    )

    assert best is not None
    assert best.code == 1


def test_weekday_membership_picks_pob_fee():
    fees = [
        FeeCategory(
            code=1,
            description="GOLF MEMBER MEN - 18 HOLES",
            price=340,
            fee_type=FeeType.GOLF,
            active=1,
            audience="member",
            gender="male",
            holes=18,
        ),
        FeeCategory(
            code=7,
            description="GOLF MEMBER POB MEN (MON FULL DAY + TUES-FRI AM) 18 HOLES",
            price=290,
            fee_type=FeeType.GOLF,
            active=1,
            audience="member",
            gender="male",
            holes=18,
            day_kind="weekday",
            priority=5,
        ),
    ]

    profile = resolve_booking_pricing_profile(
        tee_time=datetime(2026, 3, 10, 6, 46),
        member=SimpleNamespace(pricing_mode="membership_default", membership_category="Weekday Membership"),
        membership_category="Weekday Membership",
        has_member_link=True,
    )

    best = select_best_fee_from_list(
        fees,
        PricingContext(
            fee_type=FeeType.GOLF,
            tee_time=datetime(2026, 3, 10, 6, 46),
            player_type=profile.player_type,
            gender="male",
            holes=18,
            age=profile.age,
            pricing_tags=profile.pricing_tags,
        ),
    )

    assert best is not None
    assert best.code == 7


def test_member_visitor_override_changes_player_type():
    profile = resolve_booking_pricing_profile(
        tee_time=datetime(2026, 3, 10, 6, 46),
        member=SimpleNamespace(pricing_mode="visitor_override", membership_category="Mens Full Golf - Veteran"),
        membership_category="Mens Full Golf - Veteran",
        has_member_link=True,
    )

    assert profile.player_type == "visitor"
    assert profile.pricing_source == "member_override"
    assert "pensioner" in profile.pricing_tags
    assert profile.age == 60


def test_parse_tee_sheet_csv_normalizes_multiline_rows():
    content = (
        '"Course:,""Umhlali Country Club"""\n'
        '"Date:,""Tuesday, 10 March 2026"""\n'
        ",\n"
        '"Time,""Start Hole"",""Player 1"",""Player 2"",""Player 3"",""Player 4"""\n'
        '"6:46 AM,""Hole 10"",""Kenneth Chapman"\n'
        '"Mens Full Golf - Veteran"",""Malcolm Gedrim"\n'
        '"Mens Full Golf - Veteran"",""David Scott Elliott"\n'
        '"Home Owners"",""Rob Adam''s"\n'
        '"Member Guest"""\n'
    ).encode("utf-8")

    parsed = parse_tee_sheet_csv(content)

    assert parsed["course_name"] == "Umhlali Country Club"
    assert parsed["play_date"].isoformat() == "2026-03-10"
    assert parsed["slot_count"] == 1
    assert len(parsed["rows"]) == 4
    assert parsed["rows"][0]["player_name"] == "Kenneth Chapman"
    assert parsed["rows"][0]["membership_label"] == "Mens Full Golf - Veteran"
    assert parsed["rows"][3]["player_name"] == "Rob Adams"
    assert parsed["rows"][3]["booking_id"] == "tee-sheet|2026-03-10|0646|Hole 10"
