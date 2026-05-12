// Phase 7 rebuild — Admin dashboard (working surface).
// Replaces the pre-rebuild Material-3 dashboard. Wires to the real
// /api/admin/dashboard/summary endpoint for occupancy + recent activity +
// active targets; placeholders for the prototype's "live gross takings" and
// "members on course" stats are flagged with Phase 9 TODOs.
import type { CSSProperties, ReactNode } from "react";

import { AdminShell } from "../components/admin-shell/AdminShell";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { useAdminDashboardSummaryQuery } from "../features/admin-dashboard/hooks";
import { useSession } from "../session/session-context";
import type { DashboardActivityItem } from "../types/admin-dashboard";

function formatZar(amount: number | string): string {
  const numeric = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(numeric)) return "R 0.00";
  return `R ${Math.abs(numeric).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

interface StatProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  border?: boolean;
}

function Stat({ label, value, sub, accent, border }: StatProps): JSX.Element {
  return (
    <div style={{ padding: "16px 22px", borderLeft: border ? "1px solid var(--gl-border-subtle)" : "none" }}>
      <div className="gl-t-xs gl-muted">{label}</div>
      <div
        className="gl-serif gl-tabular"
        style={{ fontSize: 28, fontWeight: 500, marginTop: 6, letterSpacing: "-0.01em" }}
      >
        {value}
      </div>
      {sub ? (
        <div
          style={{
            fontSize: 11.5,
            marginTop: 4,
            color: accent ?? "var(--gl-text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function activityIconSpec(entry: DashboardActivityItem): { name: string; color: string } {
  if (entry.type === "refund") return { name: "undo", color: "var(--gl-state-atrisk)" };
  if (entry.source === "booking") return { name: "event_available", color: "var(--gl-heritage-500)" };
  if (entry.source === "pos") return { name: "point_of_sale", color: "var(--gl-state-checkedin)" };
  if (entry.source === "order") return { name: "restaurant", color: "var(--gl-state-atrisk)" };
  if (entry.type === "payment") return { name: "payments", color: "var(--gl-heritage-500)" };
  return { name: "receipt_long", color: "var(--gl-text-secondary)" };
}

function activitySource(entry: DashboardActivityItem): string {
  return `${entry.source} · ${timeAgo(entry.created_at)}`;
}

interface ActivityRowProps {
  icon: string;
  color?: string;
  text: ReactNode;
  meta: string;
}

function ActivityRow({ icon, color, text, meta }: ActivityRowProps): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "8px 0",
        borderBottom: "1px solid var(--gl-border-subtle)",
      }}
    >
      <Icon name={icon} size={16} color={color ?? "var(--gl-text-secondary)"} />
      <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5 }}>{text}</div>
      <div className="gl-muted" style={{ fontSize: 11 }}>
        {meta}
      </div>
    </div>
  );
}

const CARD_HEADER_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "18px 22px 12px 22px",
  borderBottom: "1px solid var(--gl-border-subtle)",
};

export function AdminDashboardPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const summaryQuery = useAdminDashboardSummaryQuery({ accessToken, selectedClubId });
  const summary = summaryQuery.data;

  const teeOccupancy = summary?.tee_occupancy ?? null;
  const occupancyPct = teeOccupancy?.occupancy_pct ?? null;
  const bookedSlots = teeOccupancy?.booked_slots ?? 0;
  const totalSlots = teeOccupancy?.total_slots ?? 0;
  const closeDayReady = summary?.close_day_ready ?? false;
  const noShowCount = summary?.no_show_risk_count ?? 0;
  const recentActivity = summary?.recent_activity ?? [];

  return (
    <AdminShell title="Dashboard">
      <div
        style={{
          padding: 28,
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr",
          gap: 24,
        }}
      >
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card style={{ padding: 0 }}>
            <div style={CARD_HEADER_STYLE}>
              <div>
                <div className="gl-eyebrow">{todayLabel()}</div>
                <div className="gl-serif" style={{ fontSize: 22, fontWeight: 500, marginTop: 6, letterSpacing: "-0.01em" }}>
                  The course, today
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="gl-btn gl-btn--secondary" data-size="sm" disabled aria-label="Day picker — ships in Phase 10">
                  <Icon name="today" size={14} /> Today
                </button>
                <button
                  type="button"
                  className="gl-btn gl-btn--secondary"
                  data-size="sm"
                  disabled
                  aria-label="Previous day — ships in Phase 10"
                >
                  <Icon name="chevron_left" size={14} />
                </button>
                <button
                  type="button"
                  className="gl-btn gl-btn--secondary"
                  data-size="sm"
                  disabled
                  aria-label="Next day — ships in Phase 10"
                >
                  <Icon name="chevron_right" size={14} />
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
              <Stat
                label="Slots booked"
                value={
                  summaryQuery.isLoading ? "—" : occupancyPct !== null ? `${bookedSlots} / ${totalSlots}` : "—"
                }
                sub={
                  summaryQuery.isLoading
                    ? "loading…"
                    : occupancyPct !== null
                      ? `${occupancyPct}% occupied`
                      : "no tee sheet today"
                }
              />
              {/* TODO(Phase 9D): live "members on course" metric requires read-model surface from Phase 9C tee sheet correctness work + WI-6 KPI metrics. */}
              <Stat label="Members on course" value="—" sub="needs Phase 9D" border />
              {/* TODO(Phase 9D): live gross takings is one of the WI-6 KPI metrics. */}
              <Stat label="Gross takings · live" value="—" sub="needs Phase 9D" border />
              <Stat
                label="Unpaid bookings"
                value={summaryQuery.isLoading ? "—" : summary?.unpaid_bookings_today ?? 0}
                sub={
                  summaryQuery.isLoading
                    ? "loading…"
                    : (summary?.unpaid_bookings_today ?? 0) > 0
                      ? "review before close"
                      : "all settled"
                }
                accent={(summary?.unpaid_bookings_today ?? 0) > 0 ? "var(--gl-caddie)" : undefined}
                border
              />
            </div>
          </Card>

          {/* TODO(Phase 9C/10): real "Next on the tee" read-model from tee-sheet correctness work.
              Until then, render an empty-state card pointing to the existing tee sheet route. */}
          <Card style={{ padding: 0 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "16px 22px",
                borderBottom: "1px solid var(--gl-border-subtle)",
              }}
            >
              <div className="gl-serif" style={{ fontSize: 18, fontWeight: 500 }}>
                Next on the tee
              </div>
              <a href="/admin/golf/tee-sheet" className="gl-btn gl-btn--tertiary" data-size="sm">
                Open tee sheet <Icon name="arrow_forward" size={14} />
              </a>
            </div>
            <div
              style={{
                padding: 28,
                textAlign: "center",
                color: "var(--gl-text-secondary)",
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              Phase 9C ships the live read-model that backs this card. Until then,
              the tee sheet itself is the source of truth.
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div className="gl-serif" style={{ fontSize: 18, fontWeight: 500 }}>
                Daily close
              </div>
              <Badge tone={closeDayReady ? "good" : "warn"} dot>
                {closeDayReady ? "Ready" : "Pending"}
              </Badge>
            </div>
            <div className="gl-muted gl-t-sm" style={{ marginBottom: 14 }}>
              Runs at 23:30 · {bootstrap?.selected_club?.timezone ?? "Africa/Johannesburg"}
            </div>
            {/* TODO(Phase 9D): per-acquirer close-day reconciliation rows render here once the
                multi-tender reconciliation work lands. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {noShowCount > 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <Icon name="warning_amber" size={16} color="var(--gl-state-atrisk)" />
                  <span style={{ flex: 1 }}>No-show risk</span>
                  <span className="gl-muted" style={{ fontSize: 11.5 }}>
                    {noShowCount} booking{noShowCount === 1 ? "" : "s"}
                  </span>
                </div>
              ) : null}
              {(summary?.unpaid_bookings_today ?? 0) > 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <Icon name="payments" size={16} color="var(--gl-caddie)" />
                  <span style={{ flex: 1 }}>Unpaid bookings</span>
                  <span className="gl-muted" style={{ fontSize: 11.5 }}>
                    {summary?.unpaid_bookings_today} outstanding
                  </span>
                </div>
              ) : null}
              {closeDayReady && noShowCount === 0 && (summary?.unpaid_bookings_today ?? 0) === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <Icon name="check_circle" size={16} color="var(--gl-state-checkedin)" />
                  <span style={{ flex: 1 }}>All checks clear</span>
                </div>
              ) : null}
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1px solid var(--gl-border-subtle)",
              }}
            >
              <span className="gl-t-xs gl-muted">Bound to accounting profile</span>
              <a href="/admin/finance" className="gl-btn gl-btn--primary" data-size="sm">
                Review &amp; close
              </a>
            </div>
          </Card>

          <Card>
            <div className="gl-serif" style={{ fontSize: 18, fontWeight: 500, marginBottom: 10 }}>
              Activity
            </div>
            {summaryQuery.isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="gl-skeleton" style={{ height: 16, width: "60%" }} />
                <div className="gl-skeleton" style={{ height: 16, width: "80%" }} />
                <div className="gl-skeleton" style={{ height: 16, width: "70%" }} />
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="gl-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                Nothing has moved through today yet.
              </div>
            ) : (
              recentActivity.slice(0, 6).map((entry) => {
                const { name, color } = activityIconSpec(entry);
                return (
                  <ActivityRow
                    key={entry.id}
                    icon={name}
                    color={color}
                    text={
                      <>
                        <strong>{entry.description}</strong>
                        <span className="gl-muted" style={{ marginLeft: 6, fontSize: 11.5, textTransform: "capitalize" }}>
                          · {activitySource(entry)}
                        </span>
                      </>
                    }
                    meta={formatZar(entry.amount)}
                  />
                );
              })
            )}
          </Card>

          {/* TODO(Phase 9D): real-time accounting sync status (last successful post, error count)
              wires from the Pastel API integration work; bootstrap currently only knows the bound
              profile name. */}
          <Card variant="sunken">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="gl-t-xs gl-muted">SA accounting</div>
                <div className="gl-serif" style={{ fontSize: 16, marginTop: 4, fontWeight: 500 }}>
                  Accounting export
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--gl-state-checkedin)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 6, height: 6, borderRadius: 999, background: "var(--gl-state-checkedin)" }}
                />
                Configure in Settings → Club → Accounting
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
