# app/integrations.py
"""
Third-party integrations for GreenLink Golf Booking System.

Handicap SA now defaults to an explicit disabled mode. Mock success responses are
only allowed when `HANDICAP_SA_MODE=mock` is set, so day-to-day staff never see a
fake "synced" result in normal operation.
"""

from __future__ import annotations

import os
import random
import string
from datetime import datetime


def _integration_mode() -> str:
    raw = str(os.getenv("HANDICAP_SA_MODE", "")).strip().lower()
    return raw if raw in {"mock", "disabled"} else "disabled"


class HandicapSAAdapter:
    def __init__(self) -> None:
        self.mode = _integration_mode()

    def _disabled_response(self, detail: str) -> dict:
        return {
            "success": False,
            "mode": "disabled",
            "status": "disabled",
            "detail": detail,
        }

    def open_round(self, player_name: str, handicap_number: str, greenlink_id: str | None = None) -> dict:
        if self.mode != "mock":
            return self._disabled_response("Handicap SA integration is not configured.")

        mock_round_id = f"HSA-{datetime.now().strftime('%Y%m%d')}-{''.join(random.choices(string.ascii_uppercase + string.digits, k=8))}"
        print(f"[HANDICAP SA:MOCK] Opening round for {player_name} ({handicap_number}) -> {mock_round_id}")
        return {
            "success": True,
            "mode": "mock",
            "round_id": mock_round_id,
            "player": player_name,
            "handicap": handicap_number,
            "status": "open",
        }

    def submit_scores(self, round_id: str, scores_json: str, player_name: str) -> dict:
        if self.mode != "mock":
            return self._disabled_response("Handicap SA integration is not configured.")

        print(f"[HANDICAP SA:MOCK] Submitting scores for round {round_id} ({player_name})")
        return {
            "success": True,
            "mode": "mock",
            "round_id": round_id,
            "status": "closed",
            "synced": True,
        }

    def validate_handicap_card(self, card_number: str) -> dict:
        if self.mode != "mock":
            return {
                "valid": False,
                "mode": "disabled",
                "detail": "Handicap SA validation is not configured.",
                "handicap_number": card_number,
            }

        print(f"[HANDICAP SA:MOCK] Validating card {card_number}")
        return {
            "valid": True,
            "mode": "mock",
            "handicap_number": card_number,
            "player_name": "Mock Player",
            "club": "GreenLink Golf Club",
        }


handicap_sa = HandicapSAAdapter()

# DEPRECATED: Pastel/Sage One accounting integration
# New system uses cashbook Excel exports instead
# See: app/routers/cashbook.py and CASHBOOK_EXPORT.md
