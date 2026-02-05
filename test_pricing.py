import unittest
from datetime import datetime

from app.fee_models import FeeCategory, FeeType
from app.pricing import PricingContext, select_best_fee_from_list


class PricingTests(unittest.TestCase):
    def test_visitor_weekend_picks_weekend_fee(self):
        fees = [
            FeeCategory(
                code=20,
                description="Visitor - Weekdays 18 Holes",
                price=575,
                fee_type=FeeType.GOLF,
                active=1,
                audience="visitor",
                day_kind="weekday",
                holes=18,
                priority=1,
            ),
            FeeCategory(
                code=22,
                description="Visitor - Weekends 18 Holes",
                price=700,
                fee_type=FeeType.GOLF,
                active=1,
                audience="visitor",
                day_kind="weekend",
                holes=18,
                priority=1,
            ),
        ]

        # Saturday
        ctx = PricingContext(
            fee_type=FeeType.GOLF,
            tee_time=datetime(2026, 2, 7, 8, 0, 0),
            player_type="visitor",
            holes=18,
        )

        best = select_best_fee_from_list(fees, ctx)
        self.assertIsNotNone(best)
        self.assertEqual(best.code, 22)

    def test_member_requires_gender_when_fee_is_gendered(self):
        fees = [
            FeeCategory(
                code=1,
                description="Member Men - 18 Holes",
                price=340,
                fee_type=FeeType.GOLF,
                active=1,
                audience="member",
                gender="male",
                holes=18,
            ),
            FeeCategory(
                code=73,
                description="Member Ladies - 18 Holes",
                price=340,
                fee_type=FeeType.GOLF,
                active=1,
                audience="member",
                gender="female",
                holes=18,
            ),
        ]

        ctx = PricingContext(
            fee_type=FeeType.GOLF,
            tee_time=datetime(2026, 2, 4, 8, 0, 0),
            player_type="member",
            gender=None,
            holes=18,
        )

        best = select_best_fee_from_list(fees, ctx)
        self.assertIsNone(best)

    def test_age_filtered_fee(self):
        fees = [
            FeeCategory(
                code=28,
                description="Visitor Pensioner 18 Holes",
                price=360,
                fee_type=FeeType.GOLF,
                active=1,
                audience="visitor",
                day_kind="weekday",
                holes=18,
                min_age=60,
                priority=10,
            ),
            FeeCategory(
                code=20,
                description="Visitor Weekdays 18 Holes",
                price=575,
                fee_type=FeeType.GOLF,
                active=1,
                audience="visitor",
                day_kind="weekday",
                holes=18,
                priority=1,
            ),
        ]

        ctx = PricingContext(
            fee_type=FeeType.GOLF,
            tee_time=datetime(2026, 2, 4, 8, 0, 0),
            player_type="visitor",
            holes=18,
            age=65,
        )
        best = select_best_fee_from_list(fees, ctx)
        self.assertIsNotNone(best)
        self.assertEqual(best.code, 28)

        ctx2 = PricingContext(
            fee_type=FeeType.GOLF,
            tee_time=datetime(2026, 2, 4, 8, 0, 0),
            player_type="visitor",
            holes=18,
            age=50,
        )
        best2 = select_best_fee_from_list(fees, ctx2)
        self.assertIsNotNone(best2)
        self.assertEqual(best2.code, 20)


if __name__ == "__main__":
    unittest.main()

