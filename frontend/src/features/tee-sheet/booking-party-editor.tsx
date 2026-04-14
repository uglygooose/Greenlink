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
  onAddParticipant: (type: BookingParticipantType) => void;
  onChangeParticipant: (key: string, patch: Partial<DraftParticipant>) => void;
  onRemoveParticipant: (key: string) => void;
  participants: DraftParticipant[];
}

function roleLabel(role: string): string {
  return role.replace(/_/g, " ").toLowerCase();
}

function InitialBadge({ name, type }: { name: string; type: BookingParticipantType }): JSX.Element {
  const initial = name ? name[0].toUpperCase() : type === "guest" ? "G" : type === "staff" ? "S" : "M";
  const colorClass =
    type === "guest"
      ? "bg-amber-100 text-amber-800"
      : type === "staff"
        ? "bg-secondary-container text-on-secondary-container"
        : "bg-primary-container/60 text-on-primary-container";
  return (
    <span
      className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${colorClass}`}
    >
      {initial}
    </span>
  );
}

function ParticipantRow({
  directory,
  index,
  onChangeParticipant,
  onRemoveParticipant,
  participant,
}: {
  directory: ClubPersonEntry[];
  index: number;
  onChangeParticipant: (key: string, patch: Partial<DraftParticipant>) => void;
  onRemoveParticipant: (key: string) => void;
  participant: DraftParticipant;
}): JSX.Element {
  const person = directory.find((entry) => entry.person.id === participant.person_id);
  const resolvedName =
    participant.participant_type === "guest" ? participant.guest_name : (person?.person.full_name ?? "");

  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-container-low px-3 py-2">
      <InitialBadge name={resolvedName} type={participant.participant_type} />

      <div className="min-w-0 flex-1">
        {participant.participant_type === "guest" ? (
          <input
            aria-label={`Guest name for player ${index + 1}`}
            className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-slate-400"
            onChange={(event) => onChangeParticipant(participant.key, { guest_name: event.target.value })}
            placeholder="Guest name"
            type="text"
            value={participant.guest_name}
          />
        ) : person ? (
          <>
            <p className="truncate text-sm font-semibold text-on-surface">{person.person.full_name}</p>
            <p className="text-[10px] text-slate-400">{roleLabel(person.membership.role)}</p>
          </>
        ) : (
          <select
            aria-label={`Select ${participant.participant_type} for player ${index + 1}`}
            className="w-full bg-transparent text-sm text-on-surface outline-none"
            onChange={(event) => onChangeParticipant(participant.key, { person_id: event.target.value || null })}
            value={participant.person_id ?? ""}
          >
            <option value="">Select {participant.participant_type}…</option>
            {directory.map((entry) => (
              <option key={entry.person.id} value={entry.person.id}>
                {entry.person.full_name} ({roleLabel(entry.membership.role)})
              </option>
            ))}
          </select>
        )}
      </div>

      <span
        className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
          participant.is_primary
            ? "bg-primary-container/40 text-on-primary-container"
            : participant.participant_type === "guest"
              ? "bg-amber-100 text-amber-800"
              : participant.participant_type === "staff"
                ? "bg-secondary-container text-on-secondary-container"
                : "bg-surface-container-high text-on-surface"
        }`}
      >
        {participant.is_primary ? "primary" : participant.participant_type}
      </span>

      {!participant.is_primary ? (
        <button
          aria-label={`Remove player ${index + 1}`}
          className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-600"
          onClick={() => onRemoveParticipant(participant.key)}
          type="button"
        >
          <MaterialSymbol className="text-sm" icon="close" />
        </button>
      ) : null}
    </div>
  );
}

export function BookingPartyEditor({
  directory,
  onAddParticipant,
  onChangeParticipant,
  onRemoveParticipant,
  participants,
}: BookingPartyEditorProps): JSX.Element {
  const canAdd = participants.length < 4;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Players</span>
        <span className="text-xs font-semibold text-slate-500">{participants.length}/4</span>
      </div>

      <div className="space-y-1.5">
        {participants.map((participant, index) => (
          <ParticipantRow
            directory={directory}
            index={index}
            key={participant.key}
            onChangeParticipant={onChangeParticipant}
            onRemoveParticipant={onRemoveParticipant}
            participant={participant}
          />
        ))}
      </div>

      {canAdd ? (
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-low"
            onClick={() => onAddParticipant("member")}
            type="button"
          >
            <MaterialSymbol className="text-sm" icon="person_add" />
            Add Member
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-low"
            onClick={() => onAddParticipant("staff")}
            type="button"
          >
            <MaterialSymbol className="text-sm" icon="badge" />
            Add Staff
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            onClick={() => onAddParticipant("guest")}
            type="button"
          >
            <MaterialSymbol className="text-sm" icon="person_add_alt" />
            Add Guest
          </button>
        </div>
      ) : null}
    </section>
  );
}
