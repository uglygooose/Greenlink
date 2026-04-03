import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import type { BookingParticipantType } from "../../types/bookings";
import type { ClubPersonEntry } from "../../types/people";

export type DraftParticipant = {
  key: string;
  participant_type: BookingParticipantType;
  person_id: string | null;
  guest_name: string;
  is_primary: boolean;
};

interface BookingPartyEditorProps {
  directory: ClubPersonEntry[];
  onAddParticipant: () => void;
  onChangeParticipant: (key: string, patch: Partial<DraftParticipant>) => void;
  onRemoveParticipant: (key: string) => void;
  participants: DraftParticipant[];
}

function participantTypeOptions(isPrimary: boolean): BookingParticipantType[] {
  return isPrimary ? ["member", "staff"] : ["member", "staff", "guest"];
}

function roleLabel(role: string): string {
  return role.replace(/_/g, " ").toLowerCase();
}

export function BookingPartyEditor({
  directory,
  onAddParticipant,
  onChangeParticipant,
  onRemoveParticipant,
  participants,
}: BookingPartyEditorProps): JSX.Element {
  return (
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
                aria-label="Participant Type"
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
                  aria-label="Club Person"
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
          aria-label="Add participant"
          className="inline-flex items-center gap-2 rounded-2xl bg-surface-container-low px-4 py-3 text-sm font-semibold text-on-surface"
          onClick={onAddParticipant}
          type="button"
        >
          <MaterialSymbol icon="person_add" />
          <span>Add participant</span>
        </button>
      ) : null}
    </section>
  );
}
