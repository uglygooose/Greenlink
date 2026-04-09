import { useEffect, useRef, useState } from "react";

import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import { BookingExtrasControls } from "./booking-extras-controls";
import { BookingPartyEditor, type DraftParticipant } from "./booking-party-editor";
import { useDrawerAccessibility } from "./use-drawer-accessibility";
import type { BookingPaymentStatus, BookingSummary } from "../../types/bookings";
import type { ClubPersonEntry } from "../../types/people";
import type { TeeSheetSlotView } from "../../types/tee-sheet";

type FeedbackTone = "error" | "info";

interface BookingManagementDrawerProps {
  editCaddieFlag: boolean;
  editCartFlag: boolean;
  colorCode: string | null;
  directory: ClubPersonEntry[];
  editingBookingId: string | null;
  editParticipants: DraftParticipant[];
  feedbackMessage: string | null;
  feedbackTone: FeedbackTone | null;
  laneLabel: string;
  onCancel: (bookingId: string) => void;
  onCheckIn: (bookingId: string) => void;
  onClose: () => void;
  onComplete: (bookingId: string) => void;
  onEditAddParticipant: () => void;
  onEditCancel: () => void;
  onEditCaddieFlagChange: (value: boolean) => void;
  onEditChangeParticipant: (key: string, patch: Partial<DraftParticipant>) => void;
  onEditCartFlagChange: (value: boolean) => void;
  onEditRemoveParticipant: (key: string) => void;
  onEditSave: (bookingId: string) => void;
  onEditStart: (booking: BookingSummary) => void;
  onNoShow: (bookingId: string) => void;
  onPostCharge: (bookingId: string, amount: string) => void;
  onRecordPayment: (bookingId: string) => void;
  onMarkComplimentary: (bookingId: string) => void;
  onMarkWaived: (bookingId: string) => void;
  pendingFinanceAction: "post_charge" | "record_payment" | "mark_complimentary" | "mark_waived" | null;
  pendingFinanceBookingId: string | null;
  pendingAction: "cancel" | "check_in" | "complete" | "no_show" | null;
  pendingBookingId: string | null;
  savingBookingId: string | null;
  selectedDate: string;
  showFinanceActions: boolean;
  slot: TeeSheetSlotView;
  teeLabel: string;
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function bookingStatusClassName(status: string): string {
  switch (status) {
    case "reserved":
      return "bg-primary-container/50 text-on-primary-container";
    case "checked_in":
      return "bg-secondary-container text-on-secondary-container";
    default:
      return "bg-surface-container-high text-on-surface";
  }
}

function bookingStatusLabel(status: string): string {
  return status.replace("_", " ");
}

function paymentStatusClassName(status: BookingPaymentStatus | null | undefined): string {
  switch (status) {
    case "paid":
      return "bg-primary-container/50 text-on-primary-container";
    case "pending":
      // Intentionally amber — NOT secondary-container which is also used by the
      // checked_in booking-status badge above it, preventing visual confusion.
      return "bg-amber-100 text-amber-800";
    case "complimentary":
      return "bg-surface-container-high text-on-surface";
    case "waived":
      return "bg-surface-container-high text-slate-500";
    default:
      return "bg-surface-container-high text-on-surface";
  }
}

function paymentStatusLabel(status: BookingPaymentStatus | null | undefined): string {
  return status ? status.replace("_", " ") : "unassigned";
}

function participantSummary(
  participants: Array<{ display_name: string; is_primary: boolean }>,
  partySize: number,
): string {
  const names = participants.map((participant) => participant.display_name).filter(Boolean);
  if (names.length > 0) return names.join(", ");
  return `${partySize} players`;
}

function feedbackClassName(tone: FeedbackTone | null): string {
  if (tone === "error") return "bg-error-container/40 text-on-error-container";
  return "bg-secondary-container text-on-secondary-container";
}

const actionButtonClassName =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:bg-slate-300";

interface ActionButtonProps {
  ariaLabel: string;
  disabled: boolean;
  icon: string;
  isPending: boolean;
  label: string;
  onClick: () => void;
  pendingLabel: string;
}

function ActionButton({
  ariaLabel,
  disabled,
  icon,
  isPending,
  label,
  onClick,
  pendingLabel,
}: ActionButtonProps): JSX.Element {
  return (
    <button
      aria-label={ariaLabel}
      className={actionButtonClassName}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <MaterialSymbol className="text-sm" icon={isPending ? "progress_activity" : icon} />
      <span>{isPending ? pendingLabel : label}</span>
    </button>
  );
}

function EditPanel({
  caddieFlag,
  booking,
  cartFlag,
  directory,
  onAddParticipant,
  onCancel,
  onCaddieFlagChange,
  onChangeParticipant,
  onRemoveParticipant,
  onSave,
  onCartFlagChange,
  participants,
  saving,
}: {
  caddieFlag: boolean;
  booking: BookingSummary;
  cartFlag: boolean;
  directory: ClubPersonEntry[];
  onAddParticipant: () => void;
  onCancel: () => void;
  onCaddieFlagChange: (value: boolean) => void;
  onChangeParticipant: (key: string, patch: Partial<DraftParticipant>) => void;
  onRemoveParticipant: (key: string) => void;
  onSave: () => void;
  onCartFlagChange: (value: boolean) => void;
  participants: DraftParticipant[];
  saving: boolean;
}): JSX.Element {
  return (
    <section className="space-y-4 rounded-2xl bg-surface-container p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Edit Booking</p>
          <p className="mt-1 text-sm text-on-surface">Adjust participants and guests for this reserved booking.</p>
        </div>
        <button
          className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm"
          onClick={onCancel}
          type="button"
        >
          Close Edit
        </button>
      </div>
      <BookingPartyEditor
        directory={directory}
        onAddParticipant={onAddParticipant}
        onChangeParticipant={onChangeParticipant}
        onRemoveParticipant={onRemoveParticipant}
        participants={participants}
      />
      <BookingExtrasControls
        caddieFlag={caddieFlag}
        cartFlag={cartFlag}
        onCaddieFlagChange={onCaddieFlagChange}
        onCartFlagChange={onCartFlagChange}
      />
      <div className="flex items-center justify-end gap-3">
        <button
          className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-on-surface"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          aria-label={`Save booking ${booking.id}`}
          className="rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={saving}
          onClick={onSave}
          type="button"
        >
          {saving ? "Saving..." : "Save Booking"}
        </button>
      </div>
    </section>
  );
}

export function BookingManagementDrawer({
  editCaddieFlag,
  editCartFlag,
  colorCode,
  directory,
  editingBookingId,
  editParticipants,
  feedbackMessage,
  feedbackTone,
  laneLabel,
  onCancel,
  onCheckIn,
  onClose,
  onComplete,
  onEditAddParticipant,
  onEditCancel,
  onEditCaddieFlagChange,
  onEditChangeParticipant,
  onEditCartFlagChange,
  onEditRemoveParticipant,
  onEditSave,
  onEditStart,
  onMarkComplimentary,
  onMarkWaived,
  onNoShow,
  onPostCharge,
  onRecordPayment,
  pendingFinanceAction,
  pendingFinanceBookingId,
  pendingAction,
  pendingBookingId,
  savingBookingId,
  selectedDate,
  showFinanceActions,
  slot,
  teeLabel,
}: BookingManagementDrawerProps): JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [chargeDrafts, setChargeDrafts] = useState<Record<string, string>>({});
  useDrawerAccessibility({ containerRef: panelRef, initialFocusRef: closeButtonRef, onClose });

  useEffect(() => {
    setChargeDrafts({});
  }, [slot.bookings.map((booking) => booking.id).join(":")]);

  return (
    <>
      <button
        aria-label="Close booking drawer overlay"
        className="fixed inset-0 z-40 bg-slate-950/10"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col bg-white shadow-2xl"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-center justify-between px-6 pb-5 pt-6">
          <div>
            <h3 className="font-headline text-lg font-extrabold text-slate-900">Booking Management</h3>
            <p className="text-xs text-slate-500">
              {formatDateLabel(selectedDate)} at {slot.local_time.slice(0, 5)}
            </p>
          </div>
          <button
            aria-label="Close booking drawer"
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <MaterialSymbol icon="close" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-6">
          <section className="rounded-2xl bg-surface-container-low p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Slot</p>
                <p className="mt-1 text-sm font-bold text-on-surface">{laneLabel}</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {slot.party_summary.total_players ?? 0} players in active view
                </p>
              </div>
              <span className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                {slot.display_status}
              </span>
            </div>
          </section>

          {feedbackMessage ? (
            <section className={`rounded-2xl px-4 py-3 ${feedbackClassName(feedbackTone)}`}>
              <div className="flex items-start gap-3">
                <MaterialSymbol className="text-base" icon={feedbackTone === "error" ? "warning" : "info"} />
                <p className="text-sm font-medium">{feedbackMessage}</p>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Bookings</span>
              <span className="text-xs font-semibold text-slate-500">{slot.bookings.length} active</span>
            </div>
            {slot.bookings.map((booking) => {
              const isPending = pendingBookingId === booking.id;
              const isCheckInPending = isPending && pendingAction === "check_in";
              const isCompletePending = isPending && pendingAction === "complete";
              const isNoShowPending = isPending && pendingAction === "no_show";
              const isCancelPending = isPending && pendingAction === "cancel";
              const isFinancePending = pendingFinanceBookingId === booking.id;
              const isPostChargePending = isFinancePending && pendingFinanceAction === "post_charge";
              const isRecordPaymentPending = isFinancePending && pendingFinanceAction === "record_payment";
              const isComplimentaryPending = isFinancePending && pendingFinanceAction === "mark_complimentary";
              const isWaivedPending = isFinancePending && pendingFinanceAction === "mark_waived";
              const isEditing = editingBookingId === booking.id;
              const isSaving = savingBookingId === booking.id;
              const chargeAmount = chargeDrafts[booking.id] ?? "";
              const canPostCharge =
                booking.payment_status !== "paid" &&
                booking.payment_status !== "complimentary" &&
                booking.payment_status !== "waived";
              const canRecordPayment = booking.payment_status === "pending";
              const canMarkComplimentary =
                booking.payment_status !== "complimentary" && booking.payment_status !== "paid";
              const canMarkWaived =
                booking.payment_status !== "waived" && booking.payment_status !== "paid";

              return (
                <article className="space-y-4 rounded-2xl bg-surface-container-low p-4" key={booking.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-on-surface">Booking {booking.id.slice(0, 8)}</p>
                      <p className="mt-1 truncate text-[11px] text-slate-500">{booking.id}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${bookingStatusClassName(booking.status)}`}
                    >
                      {bookingStatusLabel(booking.status)}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-on-surface">
                    <div className="flex items-center gap-2">
                      <MaterialSymbol className="text-sm text-slate-400" icon="groups" />
                      <span>{booking.party_size} players</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MaterialSymbol className="mt-0.5 text-sm text-slate-400" icon="badge" />
                      <span className="leading-relaxed">
                        {participantSummary(booking.participants, booking.party_size)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${paymentStatusClassName(booking.payment_status)}`}>
                        {paymentStatusLabel(booking.payment_status)}
                      </span>
                      <span className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface">
                        {booking.fee_label ?? "Rate pending"}
                      </span>
                      {booking.cart_flag ? (
                        <span className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface">
                          Cart
                        </span>
                      ) : null}
                      {booking.caddie_flag ? (
                        <span className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface">
                          Caddie
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {isEditing ? (
                    <EditPanel
                      caddieFlag={editCaddieFlag}
                      booking={booking}
                      cartFlag={editCartFlag}
                      directory={directory}
                      onAddParticipant={onEditAddParticipant}
                      onCancel={onEditCancel}
                      onCaddieFlagChange={onEditCaddieFlagChange}
                      onChangeParticipant={onEditChangeParticipant}
                      onCartFlagChange={onEditCartFlagChange}
                      onRemoveParticipant={onEditRemoveParticipant}
                      onSave={() => onEditSave(booking.id)}
                      participants={editParticipants}
                      saving={isSaving}
                    />
                  ) : null}

                  {showFinanceActions ? (
                    <section
                      className={`space-y-3 rounded-2xl border p-4 ${booking.payment_status === "pending" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white/70"}`}
                      data-testid={`booking-finance-panel-${booking.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Finance Actions</p>
                          <p className="mt-1 text-sm text-on-surface">
                            {booking.payment_status === "pending"
                              ? "Payment is still outstanding for this booking."
                              : "Finance state stays backend-owned. Use these actions to post or settle booking charges."}
                          </p>
                        </div>
                        {booking.payment_status === "pending" ? (
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                            Unpaid
                          </span>
                        ) : null}
                      </div>

                      <label className="space-y-1">
                        <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Charge Amount</span>
                        <input
                          aria-label={`Charge amount for booking ${booking.id}`}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-on-surface focus:border-transparent focus:ring-2 focus:ring-primary/20"
                          inputMode="decimal"
                          onChange={(event) =>
                            setChargeDrafts((current) => ({
                              ...current,
                              [booking.id]: event.target.value,
                            }))
                          }
                          placeholder="85.00"
                          type="text"
                          value={chargeAmount}
                        />
                      </label>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <ActionButton
                          ariaLabel="Post Charge"
                          disabled={!canPostCharge || chargeAmount.trim().length === 0 || isPending || isSaving || isFinancePending}
                          icon="receipt_long"
                          isPending={isPostChargePending}
                          label="Post Charge"
                          onClick={() => onPostCharge(booking.id, chargeAmount)}
                          pendingLabel="Posting..."
                        />
                        <ActionButton
                          ariaLabel="Record Payment"
                          disabled={!canRecordPayment || isPending || isSaving || isFinancePending}
                          icon="payments"
                          isPending={isRecordPaymentPending}
                          label="Record Payment"
                          onClick={() => onRecordPayment(booking.id)}
                          pendingLabel="Recording..."
                        />
                        <ActionButton
                          ariaLabel="Mark Complimentary"
                          disabled={!canMarkComplimentary || isPending || isSaving || isFinancePending}
                          icon="redeem"
                          isPending={isComplimentaryPending}
                          label="Mark Complimentary"
                          onClick={() => onMarkComplimentary(booking.id)}
                          pendingLabel="Updating..."
                        />
                        <ActionButton
                          ariaLabel="Mark Waived"
                          disabled={!canMarkWaived || isPending || isSaving || isFinancePending}
                          icon="remove_circle"
                          isPending={isWaivedPending}
                          label="Mark Waived"
                          onClick={() => onMarkWaived(booking.id)}
                          pendingLabel="Updating..."
                        />
                      </div>
                    </section>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {booking.status === "reserved" ? (
                      <button
                        aria-label={`Edit booking ${booking.id}`}
                        className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-on-surface shadow-sm"
                        disabled={isPending || isSaving}
                        onClick={() => onEditStart(booking)}
                        type="button"
                      >
                        Edit Party
                      </button>
                    ) : null}
                    {booking.status === "reserved" ? (
                      <>
                        <ActionButton
                          ariaLabel="Check In"
                          disabled={isPending || isSaving}
                          icon="how_to_reg"
                          isPending={isCheckInPending}
                          label="Check In"
                          onClick={() => onCheckIn(booking.id)}
                          pendingLabel="Checking in..."
                        />
                        <ActionButton
                          ariaLabel="Mark No-Show"
                          disabled={isPending || isSaving}
                          icon="person_off"
                          isPending={isNoShowPending}
                          label="Mark No-Show"
                          onClick={() => onNoShow(booking.id)}
                          pendingLabel="Marking..."
                        />
                      </>
                    ) : null}
                    {booking.status === "checked_in" ? (
                      <ActionButton
                        ariaLabel="Complete Booking"
                        disabled={isPending || isSaving}
                        icon="task_alt"
                        isPending={isCompletePending}
                        label="Complete Booking"
                        onClick={() => onComplete(booking.id)}
                        pendingLabel="Completing..."
                      />
                    ) : null}
                    <ActionButton
                      ariaLabel="Cancel Booking"
                      disabled={isPending || isSaving}
                      icon="event_busy"
                      isPending={isCancelPending}
                      label="Cancel Booking"
                      onClick={() => onCancel(booking.id)}
                      pendingLabel="Cancelling..."
                    />
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      </aside>
    </>
  );
}
