import { useMemo } from "react";

import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import { BookingPartyEditor, type DraftParticipant } from "./booking-party-editor";
import type { BookingCreateParticipantInput } from "../../types/bookings";
import type { ClubPersonEntry } from "../../types/people";
import type { TeeSheetSlotView } from "../../types/tee-sheet";

type FeedbackTone = "error" | "info";

interface BookingCreateDrawerProps {
  colorCode: string | null;
  creating: boolean;
  directory: ClubPersonEntry[];
  feedbackMessage: string | null;
  feedbackTone: FeedbackTone | null;
  laneLabel: string;
  onAddParticipant: () => void;
  onChangeParticipant: (key: string, patch: Partial<DraftParticipant>) => void;
  onClose: () => void;
  onCreate: () => void;
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

function asPayload(participants: DraftParticipant[]): BookingCreateParticipantInput[] {
  return participants.map((participant) => ({
    participant_type: participant.participant_type,
    person_id: participant.participant_type === "guest" ? null : participant.person_id,
    guest_name: participant.participant_type === "guest" ? participant.guest_name.trim() : null,
    is_primary: participant.is_primary,
  }));
}

export function BookingCreateDrawer({
  colorCode,
  creating,
  directory,
  feedbackMessage,
  feedbackTone,
  laneLabel,
  onAddParticipant,
  onChangeParticipant,
  onClose,
  onCreate,
  onRemoveParticipant,
  participants,
  selectedDate,
  slot,
  teeLabel,
}: BookingCreateDrawerProps): JSX.Element {
  const payloadPreview = useMemo(() => asPayload(participants), [participants]);

  return (
    <>
      <button
        aria-label="Close create booking drawer overlay"
        className="fixed inset-0 z-40 bg-slate-950/10"
        onClick={onClose}
        type="button"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between px-6 pb-5 pt-6">
          <div>
            <h3 className="font-headline text-lg font-extrabold text-slate-900">Create Booking</h3>
            <p className="text-xs text-slate-500">
              {formatDateLabel(selectedDate)} at {slot.local_time.slice(0, 5)}
            </p>
          </div>
          <button
            aria-label="Close create booking drawer"
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
                  {colorCode ? ` | ${colorCode}` : ""}
                  {" | "}
                  {slot.occupancy.remaining_player_capacity ?? 0} player spaces remaining
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

          <BookingPartyEditor
            directory={directory}
            onAddParticipant={onAddParticipant}
            onChangeParticipant={onChangeParticipant}
            onRemoveParticipant={onRemoveParticipant}
            participants={participants}
          />

          <section className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Request Preview</p>
            <p className="mt-2 text-sm text-slate-500">
              Frontend only assembles participant intent. Backend still validates membership, slot capacity, and rule outcomes.
            </p>
            <div className="mt-3 space-y-2 text-sm text-on-surface">
              {payloadPreview.map((participant, index) => (
                <div className="flex items-center justify-between gap-3" key={`${participant.participant_type}-${index}`}>
                  <span>
                    {participant.is_primary ? "Primary" : `Player ${index + 1}`} | {participant.participant_type}
                  </span>
                  <span className="text-slate-500">
                    {participant.participant_type === "guest"
                      ? participant.guest_name || "Guest"
                      : directory.find((entry) => entry.person.id === participant.person_id)?.person.full_name || "Select person"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid grid-cols-2 gap-3 bg-surface-container-low px-6 py-5">
          <button
            className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-on-surface"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white"
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
