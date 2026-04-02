import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import type { BookingPaymentStatus } from "../../types/bookings";
import type { TeeSheetSlotView } from "../../types/tee-sheet";

type FeedbackTone = "error" | "info";

interface BookingManagementDrawerProps {
  colorCode: string | null;
  feedbackMessage: string | null;
  feedbackTone: FeedbackTone | null;
  laneLabel: string;
  onCancel: (bookingId: string) => void;
  onCheckIn: (bookingId: string) => void;
  onClose: () => void;
  onComplete: (bookingId: string) => void;
  onNoShow: (bookingId: string) => void;
  pendingAction: "cancel" | "check_in" | "complete" | "no_show" | null;
  pendingBookingId: string | null;
  selectedDate: string;
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
      return "bg-secondary-container text-on-secondary-container";
    case "complimentary":
      return "bg-surface-container-high text-on-surface";
    case "waived":
      return "bg-amber-100 text-amber-800";
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
  if (names.length > 0) {
    return names.join(", ");
  }
  return `${partySize} players`;
}

function feedbackClassName(tone: FeedbackTone | null): string {
  if (tone === "error") {
    return "bg-error-container/40 text-on-error-container";
  }
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

export function BookingManagementDrawer({
  colorCode,
  feedbackMessage,
  feedbackTone,
  laneLabel,
  onCancel,
  onCheckIn,
  onClose,
  onComplete,
  onNoShow,
  pendingAction,
  pendingBookingId,
  selectedDate,
  slot,
  teeLabel,
}: BookingManagementDrawerProps): JSX.Element {
  return (
    <>
      <button
        aria-label="Close booking drawer overlay"
        className="fixed inset-0 z-40 bg-slate-950/10"
        onClick={onClose}
        type="button"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col bg-white shadow-2xl">
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
                  {teeLabel}
                  {colorCode ? ` · ${colorCode}` : ""}
                  {" · "}
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

              return (
                <article className="rounded-2xl bg-surface-container-low p-4" key={booking.id}>
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

                  <div className="mt-4 space-y-2 text-sm text-on-surface">
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface">
                          <MaterialSymbol className="text-xs" icon="golf_course" />
                          Cart
                        </span>
                      ) : null}
                      {booking.caddie_flag ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface">
                          <MaterialSymbol className="text-xs" icon="person" />
                          Caddie
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-3">
                    {booking.status === "reserved" ? (
                      <>
                        <ActionButton
                          ariaLabel="Check In"
                          disabled={isPending}
                          icon="how_to_reg"
                          isPending={isCheckInPending}
                          label="Check In"
                          onClick={() => onCheckIn(booking.id)}
                          pendingLabel="Checking in..."
                        />
                        <ActionButton
                          ariaLabel="Mark No-Show"
                          disabled={isPending}
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
                        disabled={isPending}
                        icon="task_alt"
                        isPending={isCompletePending}
                        label="Complete Booking"
                        onClick={() => onComplete(booking.id)}
                        pendingLabel="Completing..."
                      />
                    ) : null}
                    <ActionButton
                      ariaLabel="Cancel Booking"
                      disabled={isPending}
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
