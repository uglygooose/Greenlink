import { useRef } from "react";

import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import { BookingExtrasControls } from "./booking-extras-controls";
import { BookingPartyEditor, type DraftParticipant } from "./booking-party-editor";
import { useDrawerAccessibility } from "./use-drawer-accessibility";
import type { BookingParticipantType } from "../../types/bookings";
import type { ClubPersonEntry } from "../../types/people";
import type { TeeSheetSlotView } from "../../types/tee-sheet";

type FeedbackTone = "error" | "info";

interface BookingCreateDrawerProps {
  caddieFlag: boolean;
  colorCode: string | null;
  creating: boolean;
  cartFlag: boolean;
  directory: ClubPersonEntry[];
  feedbackMessage: string | null;
  feedbackTone: FeedbackTone | null;
  laneLabel: string;
  onAddParticipant: (type: BookingParticipantType) => void;
  onCaddieFlagChange: (value: boolean) => void;
  onChangeParticipant: (key: string, patch: Partial<DraftParticipant>) => void;
  onClose: () => void;
  onCreate: () => void;
  onCartFlagChange: (value: boolean) => void;
  onRemoveParticipant: (key: string) => void;
  participants: DraftParticipant[];
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

function feedbackClassName(tone: FeedbackTone | null): string {
  if (tone === "error") {
    return "bg-error-container/40 text-on-error-container";
  }
  return "bg-secondary-container text-on-secondary-container";
}

function participantReadyCount(participants: DraftParticipant[], directory: ClubPersonEntry[]): number {
  return participants.filter((participant) => {
    if (participant.participant_type === "guest") return participant.guest_name.trim().length > 0;
    return participant.person_id !== null && directory.some((entry) => entry.person.id === participant.person_id);
  }).length;
}


export function BookingCreateDrawer({
  caddieFlag,
  colorCode,
  creating,
  cartFlag,
  directory,
  feedbackMessage,
  feedbackTone,
  laneLabel,
  onAddParticipant,
  onCaddieFlagChange,
  onChangeParticipant,
  onClose,
  onCreate,
  onCartFlagChange,
  onRemoveParticipant,
  participants,
  selectedDate,
  slot,
  teeLabel,
}: BookingCreateDrawerProps): JSX.Element {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  useDrawerAccessibility({ containerRef: panelRef, initialFocusRef: closeButtonRef, onClose });

  const readyCount = participantReadyCount(participants, directory);
  const totalCount = participants.length;

  return (
    <>
      <button
        aria-label="Close create booking drawer overlay"
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
        {/* Header */}
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          <div>
            <h3 className="font-headline text-lg font-extrabold text-slate-900">Create Booking</h3>
            <p className="text-xs text-slate-500">
              {laneLabel} · {formatDateLabel(selectedDate)} · {slot.local_time.slice(0, 5)}
            </p>
          </div>
          <button
            aria-label="Close create booking drawer"
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <MaterialSymbol icon="close" />
          </button>
        </div>

        {/* Capacity indicator */}
        <div className="mx-6 mb-4 flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-2.5">
          <span className="text-xs font-semibold text-on-surface">
            {slot.occupancy.remaining_player_capacity ?? 0} spaces available
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {slot.display_status}
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-6">
          {feedbackMessage ? (
            <section className={`rounded-2xl px-4 py-3 ${feedbackClassName(feedbackTone)}`}>
              <div className="flex items-start gap-3">
                <MaterialSymbol className="text-base" icon={feedbackTone === "error" ? "warning" : "info"} />
                <p className="text-sm font-medium">{feedbackMessage}</p>
              </div>
            </section>
          ) : null}

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

          {/* Readiness indicator — only shows when something needs attention */}
          {totalCount > 0 && readyCount < totalCount ? (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
              <MaterialSymbol className="text-sm" icon="info" />
              <span>
                {totalCount - readyCount} player{totalCount - readyCount !== 1 ? "s" : ""} still need
                {totalCount - readyCount === 1 ? "s" : ""} to be filled in
              </span>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-white px-6 py-5">
          <button
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-on-surface"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={creating}
            onClick={onCreate}
            type="button"
          >
            {creating ? "Creating..." : "Create Booking"}
          </button>
        </div>
      </aside>
    </>
  );
}
