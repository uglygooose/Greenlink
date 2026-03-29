import { useEffect, useMemo, useState } from "react";

import { useCoursesQuery } from "../features/golf-settings/hooks";
import { useTeeSheetDayQuery } from "../features/tee-sheet/hooks";
import { useSession } from "../session/session-context";
import type { BookingRuleAppliesTo } from "../types/operations";
import type { TeeSheetSlotDisplayStatus, TeeSheetSlotView } from "../types/tee-sheet";

const MEMBERSHIP_OPTIONS: BookingRuleAppliesTo[] = ["member", "guest", "staff"];

function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusLabel(status: TeeSheetSlotDisplayStatus): string {
  switch (status) {
    case "available":
      return "Available";
    case "blocked":
      return "Blocked";
    case "reserved":
      return "Reserved";
    case "warning":
      return "Warning";
    default:
      return "Indeterminate";
  }
}

function firstDetail(slot: TeeSheetSlotView): string {
  if (slot.blockers[0]) {
    return slot.blockers[0].reason;
  }
  if (slot.unresolved_checks[0]) {
    return slot.unresolved_checks[0].reason;
  }
  if (slot.warnings[0]) {
    return slot.warnings[0].message;
  }
  return "No blocking state";
}

export function AdminGolfTeeSheetPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [membershipType, setMembershipType] = useState<BookingRuleAppliesTo>("member");
  const [courseId, setCourseId] = useState<string | null>(null);

  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  useEffect(() => {
    if (!courseId && coursesQuery.data && coursesQuery.data.length > 0) {
      setCourseId(coursesQuery.data[0].id);
    }
  }, [courseId, coursesQuery.data]);

  const teeSheetQuery = useTeeSheetDayQuery({
    accessToken,
    selectedClubId,
    courseId,
    date: selectedDate,
    membershipType,
  });

  const statusCounts = useMemo(() => {
    const counts: Record<TeeSheetSlotDisplayStatus, number> = {
      available: 0,
      blocked: 0,
      reserved: 0,
      indeterminate: 0,
      warning: 0,
    };
    for (const row of teeSheetQuery.data?.rows ?? []) {
      for (const slot of row.slots) {
        counts[slot.display_status] += 1;
      }
    }
    return counts;
  }, [teeSheetQuery.data]);

  return (
    <div className="admin-content-stack">
      <section className="admin-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live Tee Sheet</p>
            <h2>Day View</h2>
            <p className="muted">Read-only slot materialization using the current policy and state foundation.</p>
          </div>
          <div className="tee-sheet-toolbar">
            <label>
              Course
              <select value={courseId ?? ""} onChange={(event) => setCourseId(event.target.value || null)}>
                <option value="" disabled>
                  Select course
                </option>
                {(coursesQuery.data ?? []).map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>
            <label>
              Policy Bucket
              <select
                value={membershipType}
                onChange={(event) => setMembershipType(event.target.value as BookingRuleAppliesTo)}
              >
                {MEMBERSHIP_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="tee-sheet-stats">
          <div className="tonal-panel admin-card-compact">
            <strong>{teeSheetQuery.data?.course_name ?? "No course"}</strong>
            <span className="muted">
              {teeSheetQuery.data?.timezone ?? "Club timezone"} · {membershipType} preview
            </span>
          </div>
          <div className="tonal-panel admin-card-compact">
            <strong>{statusCounts.available}</strong>
            <span className="muted">Available</span>
          </div>
          <div className="tonal-panel admin-card-compact">
            <strong>{statusCounts.blocked}</strong>
            <span className="muted">Blocked</span>
          </div>
          <div className="tonal-panel admin-card-compact">
            <strong>{statusCounts.reserved}</strong>
            <span className="muted">Reserved</span>
          </div>
          <div className="tonal-panel admin-card-compact">
            <strong>{statusCounts.indeterminate + statusCounts.warning}</strong>
            <span className="muted">Attention</span>
          </div>
        </div>
      </section>

      <section className="admin-card">
        <div className="section-heading">
          <div>
            <h2>Slot Rows</h2>
            <p className="muted">Ordered by tee, with slot state and policy preview traces.</p>
          </div>
        </div>
        {teeSheetQuery.isLoading ? <p className="muted">Loading tee sheet...</p> : null}
        {teeSheetQuery.error ? <p className="error-text">{teeSheetQuery.error.message}</p> : null}
        {(teeSheetQuery.data?.warnings ?? []).length > 0 ? (
          <div className="stack-list">
            {teeSheetQuery.data?.warnings.map((warning) => (
              <div className="tonal-panel" key={warning.code}>
                <strong>{warning.code}</strong>
                <p className="muted">{warning.message}</p>
              </div>
            ))}
          </div>
        ) : null}
        <div className="stack-list">
          {(teeSheetQuery.data?.rows ?? []).map((row) => (
            <div className="tonal-panel" key={row.row_key}>
              <div className="section-heading">
                <div>
                  <h3>{row.label}</h3>
                  <p className="muted">{row.slots.length} generated slots</p>
                </div>
                {row.color_code ? <span className="tee-chip">{row.color_code}</span> : null}
              </div>
              <div className="tee-sheet-slot-grid">
                {row.slots.map((slot) => (
                  <article className="tee-sheet-slot-card" key={slot.slot_datetime}>
                    <div className="section-heading">
                      <strong>{slot.local_time.slice(0, 5)}</strong>
                      <span className={`slot-pill slot-pill-${slot.display_status}`}>{statusLabel(slot.display_status)}</span>
                    </div>
                    <p className="muted">
                      Occupancy {slot.occupancy.occupied_player_count ?? 0}/{slot.occupancy.player_capacity ?? 0} ·
                      Reserved {slot.occupancy.reserved_player_count ?? 0}
                    </p>
                    <p className="muted">
                      Party {slot.party_summary.total_players ?? 0} · Blockers {slot.policy_summary.blocker_count} ·
                      Unresolved {slot.policy_summary.unresolved_count}
                    </p>
                    <p className="tee-sheet-slot-note">{firstDetail(slot)}</p>
                  </article>
                ))}
              </div>
            </div>
          ))}
          {!teeSheetQuery.isLoading && (teeSheetQuery.data?.rows ?? []).length === 0 ? (
            <div className="tonal-panel">
              <p className="muted">No active tee-sheet rows were generated for the selected day.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
