from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select

from app.models import (
    Booking,
    BookingParticipantType,
    BookingRuleAppliesTo,
    ClubMembership,
    ClubMembershipRole,
    PricingPlayerType,
)
from app.schemas.availability import AvailabilityPolicyResult
from app.schemas.rule_context import RuleContextInput
from app.services.rule_context_service import RuleContextService
from app.services.rule_evaluation_service import RuleEvaluationService


@dataclass(frozen=True, slots=True)
class BookingCommercialSnapshot:
    fee_amount: Decimal | None = None
    fee_currency: str | None = None

    @property
    def is_resolved(self) -> bool:
        return self.fee_amount is not None and self.fee_currency is not None


class BookingCommercialService:
    def __init__(self, db) -> None:
        self.db = db
        self.rule_context_service = RuleContextService(db)
        self.rule_evaluation_service = RuleEvaluationService(db)

    def snapshot_from_availability(
        self,
        availability: AvailabilityPolicyResult | None,
    ) -> BookingCommercialSnapshot:
        if availability is None:
            return BookingCommercialSnapshot()
        candidates = availability.rule_evaluation.pricing.candidate_rules
        if len(candidates) != 1:
            return BookingCommercialSnapshot()
        candidate = candidates[0]
        return BookingCommercialSnapshot(
            fee_amount=candidate.price,
            fee_currency=candidate.currency,
        )

    def snapshot_for_booking(self, booking: Booking) -> BookingCommercialSnapshot:
        if booking.fee_amount is not None and booking.fee_currency:
            return BookingCommercialSnapshot(
                fee_amount=booking.fee_amount,
                fee_currency=booking.fee_currency,
            )

        primary_participant = next(
            (participant for participant in booking.participants if participant.is_primary),
            booking.participants[0] if booking.participants else None,
        )
        membership_role = None
        pricing_player_type = None
        if primary_participant is not None and primary_participant.club_membership_id is not None:
            membership = self.db.scalar(
                select(ClubMembership).where(
                    ClubMembership.id == primary_participant.club_membership_id
                )
            )
            if membership is not None:
                membership_role = membership.role
                pricing_player_type = self.resolve_pricing_player_type(
                    participant_type=primary_participant.participant_type,
                    membership=membership,
                )
        applies_to = (
            BookingRuleAppliesTo.STAFF
            if primary_participant is not None
            and primary_participant.participant_type == BookingParticipantType.STAFF
            else BookingRuleAppliesTo.GUEST
            if primary_participant is not None
            and primary_participant.participant_type == BookingParticipantType.GUEST
            else BookingRuleAppliesTo.MEMBER
        )
        if pricing_player_type is None:
            pricing_player_type = self.resolve_pricing_player_type(
                participant_type=primary_participant.participant_type
                if primary_participant is not None
                else None,
                membership=None,
            )
        context = self.rule_context_service.normalize_context(
            RuleContextInput(
                club_id=booking.club_id,
                course_id=booking.course_id,
                tee_id=booking.tee_id,
                applies_to=applies_to,
                membership_role=membership_role,
                pricing_player_type=pricing_player_type,
                holes=booking.holes,
                effective_datetime=booking.slot_datetime,
                reference_datetime=booking.slot_datetime,
            )
        )
        pricing = self.rule_evaluation_service.resolve_pricing(context)
        if len(pricing.candidate_rules) != 1:
            return BookingCommercialSnapshot()
        candidate = pricing.candidate_rules[0]
        return BookingCommercialSnapshot(
            fee_amount=candidate.price,
            fee_currency=candidate.currency,
        )

    def apply_snapshot(self, booking: Booking, snapshot: BookingCommercialSnapshot) -> None:
        booking.fee_amount = snapshot.fee_amount
        booking.fee_currency = snapshot.fee_currency

    def resolve_pricing_player_type(
        self,
        *,
        participant_type: BookingParticipantType | None,
        membership: ClubMembership | None,
    ) -> PricingPlayerType:
        if participant_type == BookingParticipantType.GUEST:
            if membership is not None:
                metadata_type = self._metadata_player_type(membership.membership_metadata)
                if metadata_type in {
                    PricingPlayerType.VISITOR_AFFILIATED,
                    PricingPlayerType.VISITOR_NON_AFFILIATED,
                }:
                    return metadata_type
            return PricingPlayerType.VISITOR_NON_AFFILIATED

        if membership is not None:
            metadata_type = self._metadata_player_type(membership.membership_metadata)
            if metadata_type is not None:
                return metadata_type
            if membership.role in {ClubMembershipRole.CLUB_ADMIN, ClubMembershipRole.CLUB_STAFF}:
                return PricingPlayerType.STAFF_COURTESY
        if participant_type == BookingParticipantType.STAFF:
            return PricingPlayerType.STAFF_COURTESY
        return PricingPlayerType.MEMBER_STANDARD

    def resolve_pricing_player_type_for_membership_id(
        self,
        membership_id,
        *,
        participant_type: BookingParticipantType | None,
    ) -> tuple[ClubMembershipRole | None, PricingPlayerType]:
        membership = (
            self.db.scalar(select(ClubMembership).where(ClubMembership.id == membership_id))
            if membership_id
            else None
        )
        return (
            membership.role if membership is not None else None,
            self.resolve_pricing_player_type(
                participant_type=participant_type, membership=membership
            ),
        )

    def resolve_booking_holes(self, *, course_holes: int, requested_holes: int | None) -> int:
        holes = requested_holes or course_holes
        if holes not in {9, 18}:
            raise ValueError("holes must be 9 or 18")
        if course_holes == 9 and holes != 9:
            raise ValueError("9-hole courses only support 9-hole bookings")
        return holes

    def _metadata_player_type(self, metadata: dict[str, object] | None) -> PricingPlayerType | None:
        raw = (metadata or {}).get("pricing_player_type")
        if not isinstance(raw, str):
            return None
        try:
            return PricingPlayerType(raw)
        except ValueError:
            return None
