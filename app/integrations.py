# app/integrations.py
"""
Third-party integrations for GreenLink Golf Booking System
- Handicap SA: Mock (waiting for API)
- Pastel/Sage One: DEPRECATED (use cashbook export instead)
"""

import random
import string
from datetime import datetime


class MockHandicapSA:
    """Mock Handicap SA integration - Replace with real API when available"""

    @staticmethod
    def open_round(player_name: str, handicap_number: str, greenlink_id: str = None) -> dict:
        """
        Simulate opening a round in Handicap SA
        Returns a mock round ID from Handicap SA
        """
        mock_round_id = f"HSA-{datetime.now().strftime('%Y%m%d')}-{''.join(random.choices(string.ascii_uppercase + string.digits, k=8))}"

        print(f"[HANDICAP SA] Opening round for {player_name} (Handicap: {handicap_number})")
        print(f"[HANDICAP SA] Round ID: {mock_round_id}")

        return {
            "success": True,
            "round_id": mock_round_id,
            "player": player_name,
            "handicap": handicap_number,
            "status": "open"
        }

    @staticmethod
    def submit_scores(round_id: str, scores_json: str, player_name: str) -> dict:
        """
        Simulate submitting scores to Handicap SA and closing the round
        """
        print(f"[HANDICAP SA] Submitting scores for round {round_id}")
        print(f"[HANDICAP SA] Player: {player_name}")
        print(f"[HANDICAP SA] Scores: {scores_json}")
        print(f"[HANDICAP SA] Round closed successfully")

        return {
            "success": True,
            "round_id": round_id,
            "status": "closed",
            "synced": True
        }

    @staticmethod
    def validate_handicap_card(card_number: str) -> dict:
        """
        Simulate validating a handicap card number
        Returns mock player data
        """
        print(f"[HANDICAP SA] Validating card: {card_number}")

        return {
            "valid": True,
            "handicap_number": card_number,
            "player_name": "Mock Player",
            "club": "GreenLink Golf Club"
        }


# Singleton instances
handicap_sa = MockHandicapSA()

# DEPRECATED: Pastel/Sage One accounting integration
# New system uses cashbook Excel exports instead
# See: app/routers/cashbook.py and CASHBOOK_EXPORT.md
