import { useMemo } from "react";

import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import type { ClubPersonEntry } from "../../types/people";
import type { BookingCreateParticipantInput, BookingParticipantType } from "../../types/bookings";
import type { TeeSheetSlotView } from "../../types/tee-sheet";

type FeedbackTone = "error" | "info";

type DraftParticipant = {
  key: string;
  participant_type: BookingParticipantType;
  person_id: string | null;
  guest_name: string;
  is_primary: boolean;
};

interface BookingCreateDrawerProps {
  colorCode: string | null;
  creating: boolean;
  directory: ClubPersonEntry[];
  feedbackMessage: string | null;
  feedbackTone: FeedbackTone | null;
  onAddParticipant: () => void;
  onChangeParticipant: (key: string, patch: Partial<DraftParticipant>) => void;
  onClose: () => void;
  onCreate: () => void;
  onRemoveParticipant: (key: string) => void;
  participants: DraftParticipant[];
  rowLabel: string;
  selectedDate: string;
  slot: TeeSheetSlotView;
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

function participantTypeOptions(isPrimary: boolean): BookingParticipantType[] {
  return isPrimary ? ["member", "staff"] : ["member", "staff", "guest"];
}

function roleLabel(role: string): string {
  return role.replace(/_/g, " ").toLowerCase();
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
  onAddParticipant,
  onChangeParticipant,
  onClose,
  onCreate,
  onRemoveParticipant,
  participants,
  rowLabel,
  selectedDate,
  slot,
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
                <p className="mt-1 text-sm font-bold text-on-surface">{rowLabel}</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {colorCode ? `${colorCode} • ` : ""}
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

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Party Builder</span>
              <span className="text-xs font-semibold text-slate-500">{participants.length}/4 players</span>
            </div>
            {participants.map((participant, index) => (
              <article className="rounded-2xl bg-surface-container-low p-4" key={participant.key}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-on-surface">
                      {participant.is_primary ? "Primary player" : `Player ${index + 1}`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {participant.is_primary
                        ? "Primary participant must be member or staff."
                        : "Add member, staff, or guest participants."}
                    </p>
                  </div>
                  {!participant.is_primary ? (
                    <button
                      className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm"
                      onClick={() => onRemoveParticipant(participant.key)}
                      type="button"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-3">
                  <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Participant Type
                    <select
                      className="rounded-2xl bg-white px-4 py-3 text-sm text-on-surface outline-none"
                      onChange={(event) =>
                        onChangeParticipant(participant.key, {
                          participant_type: event.target.value as BookingParticipantType,
                          person_id: null,
                          guest_name: "",
                        })
                      }
                      value={participant.participant_type}
                    >
                      {participantTypeOptions(participant.is_primary).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  {participant.participant_type === "guest" ? (
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Guest Name
                      <input
                        className="rounded-2xl bg-white px-4 py-3 text-sm text-on-surface outline-none"
                        onChange={(event) => onChangeParticipant(participant.key, { guest_name: event.target.value })}
                        placeholder="Guest name"
                        type="text"
                        value={participant.guest_name}
                      />
                    </label>
                  ) : (
                    <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Club Person
                      <select
                        className="rounded-2xl bg-white px-4 py-3 text-sm text-on-surface outline-none"
                        onChange={(event) => onChangeParticipant(participant.key, { person_id: event.target.value || null })}
                        value={participant.person_id ?? ""}
                      >
                        <option value="">Select a club person</option>
                        {directory.map((entry) => (
                          <option key={entry.person.id} value={entry.person.id}>
                            {entry.person.full_name} ({roleLabel(entry.membership.role)})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </article>
            ))}

            {participants.length < 4 ? (
              <button
                className="inline-flex items-center gap-2 rounded-2xl bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface"
                onClick={onAddParticipant}
                type="button"
              >
                <MaterialSymbol icon="person_add" />
                <span>Add participant</span>
              </button>
            ) : null}
          </section>

          <section className="rounded-2xl bg-surface-container-low p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Request Preview</p>
            <p className="mt-2 text-sm text-slate-500">
              Frontend only assembles participant intent. Backend still validates membership, slot capacity, and rule outcomes.
            </p>
            <div className="mt-3 space-y-2 text-sm text-on-surface">
              {payloadPreview.map((participant, index) => (
                <div className="flex items-center justify-between gap-3" key={`${participant.participant_type}-${index}`}>
                  <span>
                    {participant.is_primary ? "Primary" : `Player ${index + 1}`} · {participant.participant_type}
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
