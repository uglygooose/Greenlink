from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    AccountCustomer,
    Booking,
    BookingPaymentStatus,
    FinanceAccount,
    FinanceAccountStatus,
    FinanceTransaction,
    FinanceTransactionSource,
    FinanceTransactionType,
)
from app.schemas.bookings import (
    BookingChargePostRequest,
    BookingChargePostResult,
    BookingFinanceMutationFailureDetail,
    BookingPaymentRecordRequest,
    BookingPaymentRecordResult,
    BookingPaymentStatusUpdateRequest,
    BookingPaymentStatusUpdateResult,
    BookingRefundRequest,
    BookingRefundResult,
    BookingSummary,
)
from app.schemas.finance import FinanceTransactionCreateRequest, FinanceTransactionResponse
from app.services.booking_commercial_service import BookingCommercialService
from app.services.finance.ledger_service import LedgerService


class BookingFinanceService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.ledger_service = LedgerService(db)
        self.booking_commercial_service = BookingCommercialService(db)

    def update_payment_status(
        self,
        *,
        club_id: uuid.UUID,
        payload: BookingPaymentStatusUpdateRequest,
    ) -> BookingPaymentStatusUpdateResult:
        booking = self._load_booking(club_id=club_id, booking_id=payload.booking_id)
        if booking is None:
            return BookingPaymentStatusUpdateResult(
                booking_id=payload.booking_id,
                decision="blocked",
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_not_found",
                        message="booking_id was not found in the selected club",
                        field="booking_id",
                    )
                ],
            )

        current_status = booking.payment_status
        if current_status == payload.payment_status:
            return BookingPaymentStatusUpdateResult(
                booking_id=booking.id,
                decision="allowed",
                update_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[],
            )

        if payload.payment_status == BookingPaymentStatus.PAID:
            return BookingPaymentStatusUpdateResult(
                booking_id=booking.id,
                decision="blocked",
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_paid_status_requires_record_payment",
                        message="Use record-payment to mark a booking as paid in this phase",
                        field="payment_status",
                        current_status=booking.status,
                        current_payment_status=current_status,
                    )
                ],
            )

        if current_status == BookingPaymentStatus.PAID:
            return BookingPaymentStatusUpdateResult(
                booking_id=booking.id,
                decision="blocked",
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_paid_status_locked",
                        message="Paid bookings cannot be reclassified in this phase",
                        field="payment_status",
                        current_status=booking.status,
                        current_payment_status=current_status,
                    )
                ],
            )

        booking.payment_status = payload.payment_status
        self.db.add(booking)
        self.db.commit()

        hydrated = self._load_booking(club_id=club_id, booking_id=booking.id)
        assert hydrated is not None
        return BookingPaymentStatusUpdateResult(
            booking_id=hydrated.id,
            decision="allowed",
            update_applied=True,
            booking=BookingSummary.model_validate(hydrated),
            failures=[],
        )

    def post_charge(
        self,
        *,
        club_id: uuid.UUID,
        payload: BookingChargePostRequest,
    ) -> BookingChargePostResult:
        booking = self._load_booking(club_id=club_id, booking_id=payload.booking_id)
        if booking is None:
            return BookingChargePostResult(
                booking_id=payload.booking_id,
                decision="blocked",
                posting_applied=False,
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_not_found",
                        message="booking_id was not found in the selected club",
                        field="booking_id",
                    )
                ],
            )

        if booking.payment_status in {BookingPaymentStatus.COMPLIMENTARY, BookingPaymentStatus.WAIVED}:
            return BookingChargePostResult(
                booking_id=booking.id,
                decision="blocked",
                posting_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_payment_status_not_chargeable",
                        message="Complimentary or waived bookings cannot post a finance charge in this phase",
                        field="payment_status",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        if booking.payment_status == BookingPaymentStatus.PAID:
            return BookingChargePostResult(
                booking_id=booking.id,
                decision="blocked",
                posting_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_payment_status_locked",
                        message="Paid bookings cannot post an additional finance charge in this phase",
                        field="payment_status",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        existing_charge = self._load_transaction_for_booking(
            club_id=club_id,
            booking_id=booking.id,
            transaction_type=FinanceTransactionType.CHARGE,
        )
        if existing_charge is not None:
            return BookingChargePostResult(
                booking_id=booking.id,
                decision="allowed",
                posting_applied=False,
                booking=BookingSummary.model_validate(booking),
                transaction=FinanceTransactionResponse.model_validate(existing_charge),
                balance=self._compute_balance(club_id=club_id, account_id=existing_charge.account_id),
                failures=[],
            )

        charge_amount = payload.amount
        if charge_amount is None:
            commercial_snapshot = self.booking_commercial_service.snapshot_for_booking(booking)
            charge_amount = commercial_snapshot.fee_amount
        if charge_amount is None:
            return BookingChargePostResult(
                booking_id=booking.id,
                decision="blocked",
                posting_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_charge_amount_unresolved",
                        message="Resolved booking price is unavailable. Use an override amount or fix pricing setup first.",
                        field="amount",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        finance_account = self._resolve_finance_account(club_id=club_id, booking=booking)
        if finance_account is None:
            return BookingChargePostResult(
                booking_id=booking.id,
                decision="blocked",
                posting_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_finance_account_not_found",
                        message="Booking requires an active finance account before posting a charge in this phase",
                        field="booking_id",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        if finance_account.status != FinanceAccountStatus.ACTIVE:
            return BookingChargePostResult(
                booking_id=booking.id,
                decision="blocked",
                posting_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_finance_account_closed",
                        message="Booking charge cannot post to a closed finance account",
                        field="booking_id",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        created = self.ledger_service.create_transaction(
            club_id=club_id,
            payload=FinanceTransactionCreateRequest(
                account_id=finance_account.id,
                amount=-charge_amount,
                type=FinanceTransactionType.CHARGE,
                source=FinanceTransactionSource.BOOKING,
                reference_id=booking.id,
                description=self._charge_description(booking=booking, override=payload.description),
            ),
        )

        booking.payment_status = BookingPaymentStatus.PENDING
        self.db.add(booking)
        self.db.commit()

        hydrated = self._load_booking(club_id=club_id, booking_id=booking.id)
        assert hydrated is not None
        return BookingChargePostResult(
            booking_id=hydrated.id,
            decision="allowed",
            posting_applied=True,
            booking=BookingSummary.model_validate(hydrated),
            transaction=created.transaction,
            balance=created.balance,
            failures=[],
        )

    def record_payment(
        self,
        *,
        club_id: uuid.UUID,
        payload: BookingPaymentRecordRequest,
    ) -> BookingPaymentRecordResult:
        booking = self._load_booking(club_id=club_id, booking_id=payload.booking_id)
        if booking is None:
            return BookingPaymentRecordResult(
                booking_id=payload.booking_id,
                decision="blocked",
                settlement_applied=False,
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_not_found",
                        message="booking_id was not found in the selected club",
                        field="booking_id",
                    )
                ],
            )

        if booking.payment_status in {BookingPaymentStatus.COMPLIMENTARY, BookingPaymentStatus.WAIVED}:
            return BookingPaymentRecordResult(
                booking_id=booking.id,
                decision="blocked",
                settlement_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_payment_status_not_payable",
                        message="Complimentary or waived bookings cannot record payment in this phase",
                        field="payment_status",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        existing_payment = self._load_transaction_for_booking(
            club_id=club_id,
            booking_id=booking.id,
            transaction_type=FinanceTransactionType.PAYMENT,
        )
        if existing_payment is not None:
            return BookingPaymentRecordResult(
                booking_id=booking.id,
                decision="allowed",
                settlement_applied=False,
                booking=BookingSummary.model_validate(booking),
                transaction=FinanceTransactionResponse.model_validate(existing_payment),
                balance=self._compute_balance(club_id=club_id, account_id=existing_payment.account_id),
                failures=[],
            )

        charge_transaction = self._load_transaction_for_booking(
            club_id=club_id,
            booking_id=booking.id,
            transaction_type=FinanceTransactionType.CHARGE,
        )
        if charge_transaction is None:
            return BookingPaymentRecordResult(
                booking_id=booking.id,
                decision="blocked",
                settlement_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_charge_not_posted",
                        message="Booking charge must be posted before payment can be recorded",
                        field="booking_id",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        finance_account = self._load_finance_account(
            club_id=club_id,
            account_id=charge_transaction.account_id,
        )
        if finance_account is None:
            return BookingPaymentRecordResult(
                booking_id=booking.id,
                decision="blocked",
                settlement_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_finance_account_not_found",
                        message="Linked finance account was not found for this booking charge",
                        field="booking_id",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        if finance_account.status != FinanceAccountStatus.ACTIVE:
            return BookingPaymentRecordResult(
                booking_id=booking.id,
                decision="blocked",
                settlement_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_finance_account_closed",
                        message="Booking payment cannot settle against a closed finance account",
                        field="booking_id",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        settlement_amount = abs(charge_transaction.amount)
        created = self.ledger_service.create_transaction(
            club_id=club_id,
            payload=FinanceTransactionCreateRequest(
                account_id=finance_account.id,
                amount=settlement_amount,
                type=FinanceTransactionType.PAYMENT,
                source=FinanceTransactionSource.BOOKING,
                reference_id=booking.id,
                description=f"Payment for booking {str(booking.id)[:8]}",
            ),
        )

        booking.payment_status = BookingPaymentStatus.PAID
        self.db.add(booking)
        self.db.commit()

        hydrated = self._load_booking(club_id=club_id, booking_id=booking.id)
        assert hydrated is not None
        return BookingPaymentRecordResult(
            booking_id=hydrated.id,
            decision="allowed",
            settlement_applied=True,
            booking=BookingSummary.model_validate(hydrated),
            transaction=created.transaction,
            balance=created.balance,
            failures=[],
        )

    def post_refund(
        self,
        *,
        club_id: uuid.UUID,
        payload: BookingRefundRequest,
    ) -> BookingRefundResult:
        booking = self._load_booking(club_id=club_id, booking_id=payload.booking_id)
        if booking is None:
            return BookingRefundResult(
                booking_id=payload.booking_id,
                decision="blocked",
                refund_applied=False,
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_not_found",
                        message="booking_id was not found in the selected club",
                        field="booking_id",
                    )
                ],
            )

        if booking.payment_status != BookingPaymentStatus.PAID:
            return BookingRefundResult(
                booking_id=booking.id,
                decision="blocked",
                refund_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_not_paid",
                        message="Refunds can only be posted against paid bookings",
                        field="booking_id",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        charge_transaction = self._load_transaction_for_booking(
            club_id=club_id,
            booking_id=booking.id,
            transaction_type=FinanceTransactionType.CHARGE,
        )
        if charge_transaction is None:
            return BookingRefundResult(
                booking_id=booking.id,
                decision="blocked",
                refund_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_charge_not_found",
                        message="No charge transaction found for this booking — cannot post a refund",
                        field="booking_id",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        finance_account = self._load_finance_account(
            club_id=club_id,
            account_id=charge_transaction.account_id,
        )
        if finance_account is None:
            return BookingRefundResult(
                booking_id=booking.id,
                decision="blocked",
                refund_applied=False,
                booking=BookingSummary.model_validate(booking),
                failures=[
                    BookingFinanceMutationFailureDetail(
                        code="booking_finance_account_not_found",
                        message="Linked finance account was not found for this booking",
                        field="booking_id",
                        current_status=booking.status,
                        current_payment_status=booking.payment_status,
                    )
                ],
            )

        # Refund amount: explicit override or defaults to the full original charge.
        # Stored as a positive amount (credit to member account, reversing some or
        # all of the original charge effect).
        refund_amount = payload.amount if payload.amount is not None else abs(charge_transaction.amount)
        description = (
            payload.description.strip()
            if payload.description and payload.description.strip()
            else f"Refund for booking {str(booking.id)[:8]}"
        )

        created = self.ledger_service.create_transaction(
            club_id=club_id,
            payload=FinanceTransactionCreateRequest(
                account_id=finance_account.id,
                amount=refund_amount,
                type=FinanceTransactionType.REFUND,
                source=FinanceTransactionSource.BOOKING,
                reference_id=booking.id,
                description=description,
            ),
        )

        # Revert payment status to PENDING: the booking now has an open financial
        # position that requires close-day review (partial re-charge, account credit
        # application, or explicit waive decision).
        booking.payment_status = BookingPaymentStatus.PENDING
        self.db.add(booking)
        self.db.commit()

        hydrated = self._load_booking(club_id=club_id, booking_id=booking.id)
        assert hydrated is not None
        return BookingRefundResult(
            booking_id=hydrated.id,
            decision="allowed",
            refund_applied=True,
            booking=BookingSummary.model_validate(hydrated),
            transaction=created.transaction,
            balance=created.balance,
            failures=[],
        )

    def _load_booking(self, *, club_id: uuid.UUID, booking_id: uuid.UUID) -> Booking | None:
        return self.db.scalar(
            select(Booking)
            .options(selectinload(Booking.participants))
            .where(Booking.id == booking_id, Booking.club_id == club_id)
        )

    def _resolve_finance_account(self, *, club_id: uuid.UUID, booking: Booking) -> FinanceAccount | None:
        if booking.primary_person_id is None:
            return None
        return self.db.scalar(
            select(FinanceAccount)
            .join(AccountCustomer, AccountCustomer.id == FinanceAccount.account_customer_id)
            .where(
                FinanceAccount.club_id == club_id,
                AccountCustomer.club_id == club_id,
                AccountCustomer.person_id == booking.primary_person_id,
                AccountCustomer.active.is_(True),
            )
        )

    def _load_finance_account(self, *, club_id: uuid.UUID, account_id: uuid.UUID) -> FinanceAccount | None:
        return self.db.scalar(
            select(FinanceAccount).where(
                FinanceAccount.id == account_id,
                FinanceAccount.club_id == club_id,
            )
        )

    def _load_transaction_for_booking(
        self,
        *,
        club_id: uuid.UUID,
        booking_id: uuid.UUID,
        transaction_type: FinanceTransactionType,
    ) -> FinanceTransaction | None:
        return self.db.scalar(
            select(FinanceTransaction)
            .where(
                FinanceTransaction.club_id == club_id,
                FinanceTransaction.reference_id == booking_id,
                FinanceTransaction.source == FinanceTransactionSource.BOOKING,
                FinanceTransaction.type == transaction_type,
            )
            .order_by(FinanceTransaction.created_at.desc(), FinanceTransaction.id.desc())
        )

    def _compute_balance(self, *, club_id: uuid.UUID, account_id: uuid.UUID) -> Decimal:
        balance = self.db.scalar(
            select(func.sum(FinanceTransaction.amount)).where(
                FinanceTransaction.club_id == club_id,
                FinanceTransaction.account_id == account_id,
            )
        )
        return balance if balance is not None else Decimal("0.00")

    def _charge_description(self, *, booking: Booking, override: str | None) -> str:
        if override and override.strip():
            return override.strip()
        if booking.fee_label:
            return f"Booking charge {str(booking.id)[:8]} - {booking.fee_label}"
        return f"Booking charge {str(booking.id)[:8]}"
