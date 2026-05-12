// Phase 7 rebuild — Settings hub (working surface).
// Replaces the pre-rebuild SettingsCards grid with the prototype's sectioned
// layout: sub-nav + sectioned form. POPIA consent + Information Officer
// designation are stubbed with TODOs referencing Phase 9A.
import type { CSSProperties, ReactNode } from "react";

import { AdminShell } from "../components/admin-shell/AdminShell";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { useAccountingExportProfilesQuery } from "../features/finance/hooks";
import { useClubConfigQuery } from "../features/golf-settings/hooks";
import { useSession } from "../session/session-context";

interface SubNavItem {
  label: string;
  active?: boolean;
  comingPhase?: string;
}

interface SubNavGroup {
  title: string;
  items: SubNavItem[];
}

const SUBNAV_GROUPS: SubNavGroup[] = [
  {
    title: "Account",
    items: [
      { label: "Profile", comingPhase: "Phase 11" },
      { label: "Security", comingPhase: "Phase 11" },
      { label: "Notifications", comingPhase: "Phase 9E" },
    ],
  },
  {
    title: "Club",
    items: [
      { label: "Club details", active: true },
      { label: "Accounting", comingPhase: "Phase 10" },
      { label: "Info Officer", comingPhase: "Phase 9A" },
      { label: "Integrations", comingPhase: "Phase 9D" },
    ],
  },
  {
    title: "Members",
    items: [
      { label: "Membership types", comingPhase: "Phase 11" },
      { label: "Households", comingPhase: "Phase 11" },
      { label: "Billing rules", comingPhase: "Phase 9D" },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Communications", comingPhase: "Phase 9E" },
      { label: "Accessibility", comingPhase: "v1.5" },
    ],
  },
];

function SubNavRow({ item }: { item: SubNavItem }): JSX.Element {
  const baseStyle: CSSProperties = {
    display: "block",
    padding: "7px 10px",
    borderRadius: 5,
    fontSize: 13,
    fontWeight: item.active ? 500 : 400,
    color: item.active ? "var(--gl-text-primary)" : "var(--gl-text-secondary)",
    background: item.active ? "var(--gl-surface-2)" : "transparent",
    borderLeft: item.active ? "2px solid var(--gl-brand)" : "2px solid transparent",
    textDecoration: "none",
  };
  if (item.active) {
    return <span style={baseStyle}>{item.label}</span>;
  }
  return (
    <span
      aria-disabled="true"
      title={`${item.label} — ships in ${item.comingPhase ?? "a later phase"}`}
      style={{ ...baseStyle, opacity: 0.55, cursor: "not-allowed" }}
    >
      {item.label}
    </span>
  );
}

interface SectionProps {
  title: string;
  pill?: { tone: "good" | "warn"; text: string };
  children: ReactNode;
}

function SettingsSection({ title, pill, children }: SectionProps): JSX.Element {
  return (
    <section style={{ marginBottom: 32 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          paddingBottom: 12,
          borderBottom: "1px solid var(--gl-border-subtle)",
          marginBottom: 18,
        }}
      >
        <h3 className="gl-serif" style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: "-0.005em" }}>
          {title}
        </h3>
        {pill ? (
          <Badge tone={pill.tone === "good" ? "good" : "warn"} dot>
            {pill.text}
          </Badge>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string | undefined;
  tabular?: boolean;
  placeholder?: string;
}

function Field({ label, value, tabular, placeholder }: FieldProps): JSX.Element {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 18, alignItems: "center" }}>
      <span className="gl-label" style={{ margin: 0 }}>
        {label}
      </span>
      <input
        className={`gl-input${tabular ? " gl-tabular" : ""}`}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        aria-label={label}
        readOnly
      />
    </div>
  );
}

interface RadioCardProps {
  title: string;
  description: string;
  meta?: string;
  selected?: boolean;
}

function RadioCard({ title, description, meta, selected }: RadioCardProps): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: 16,
        border: `1px solid ${selected ? "var(--gl-brand)" : "var(--gl-border-subtle)"}`,
        borderRadius: 6,
        background: selected ? "var(--gl-brand-soft)" : "var(--gl-surface-raised)",
        transition: "border-color 180ms",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          marginTop: 2,
          flexShrink: 0,
          border: `1.5px solid ${selected ? "var(--gl-brand)" : "var(--gl-border-strong)"}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? (
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--gl-brand)" }} />
        ) : null}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
        <div className="gl-muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
          {description}
        </div>
        {meta ? (
          <div className="gl-mono" style={{ fontSize: 11, color: "var(--gl-text-secondary)", marginTop: 8 }}>
            {meta}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AdminSettingsHubPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const club = bootstrap?.selected_club;
  const clubConfigQuery = useClubConfigQuery({ accessToken, selectedClubId });
  const profilesQuery = useAccountingExportProfilesQuery({ accessToken, selectedClubId });
  const profiles = profilesQuery.data?.profiles ?? [];
  const activeProfile = profiles.find((profile) => profile.is_active);

  const config = clubConfigQuery.data;
  // Convert slot-interval-minutes to "X minutes" / booking_window_days to "Y days" etc.
  const slotInterval = config?.default_slot_interval_minutes
    ? `${config.default_slot_interval_minutes} minutes`
    : undefined;
  const bookingWindow = config?.booking_window_days ? `${config.booking_window_days} days` : undefined;
  const cancellationWindow = config?.cancellation_policy_hours
    ? `${config.cancellation_policy_hours} hours`
    : undefined;

  return (
    <AdminShell title="Club" breadcrumbs={["Settings"]}>
      <div style={{ display: "flex", height: "100%" }}>
        {/* Sub-nav */}
        <nav
          aria-label="Settings sections"
          style={{
            width: 200,
            padding: "20px 8px 20px 20px",
            borderRight: "1px solid var(--gl-border-subtle)",
            flexShrink: 0,
          }}
        >
          {SUBNAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="gl-t-xs gl-muted" style={{ padding: "16px 10px 10px 10px" }}>
                {group.title}
              </div>
              {group.items.map((item) => (
                <SubNavRow key={item.label} item={item} />
              ))}
            </div>
          ))}
        </nav>

        {/* Form pane */}
        <div style={{ flex: 1, padding: "28px 36px", overflow: "auto" }}>
          <div style={{ maxWidth: 720 }}>
            <h2 className="gl-serif" style={{ margin: 0, fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em" }}>
              Club details
            </h2>
            <p className="gl-muted" style={{ marginTop: 6, marginBottom: 28, fontSize: 13.5, lineHeight: 1.55 }}>
              The configuration members and staff see across every surface. Changes propagate within a minute.
            </p>

            <SettingsSection title="Identity">
              <Field label="Club name" value={club?.name} />
              <Field label="Region / Province" value={club?.location} />
              <Field label="Timezone" value={club?.timezone} />
              <Field label="Slug" value={club?.slug} />
            </SettingsSection>

            <SettingsSection
              title="Accounting binding"
              pill={
                activeProfile
                  ? { tone: "good", text: "Connected" }
                  : { tone: "warn", text: "Not bound" }
              }
            >
              {profilesQuery.isLoading ? (
                <Card variant="flat" style={{ padding: 16 }}>
                  <div className="gl-skeleton" style={{ height: 16, width: "60%", marginBottom: 8 }} />
                  <div className="gl-skeleton" style={{ height: 12, width: "80%" }} />
                </Card>
              ) : profiles.length === 0 ? (
                <Card variant="sunken" style={{ padding: 16 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <Icon name="info" size={20} color="var(--gl-heritage-500)" />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>No accounting profiles configured yet.</div>
                      <div className="gl-muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
                        Superadmin binds the club's accounting profile during onboarding.
                        See /superadmin/accounting-profiles.
                      </div>
                    </div>
                  </div>
                </Card>
              ) : (
                profiles.map((profile) => (
                  <RadioCard
                    key={profile.id}
                    title={profile.name}
                    description={
                      profile.is_active
                        ? "Active profile. Daily close exports to the mapped GL accounts on schedule."
                        : "Available — switch with finance lead approval."
                    }
                    meta={profile.is_active ? `Code · ${profile.code}` : undefined}
                    selected={profile.is_active}
                  />
                ))
              )}
            </SettingsSection>

            <SettingsSection title="Course & tee sheet defaults">
              <Field label="Default slot interval" value={slotInterval} tabular />
              <Field label="Booking lead-time" value={bookingWindow} tabular />
              <Field label="Cancellation window" value={cancellationWindow} tabular />
            </SettingsSection>

            {/* TODO(Phase 9A): wire PUT /api/clubs/config from a form-submit handler.
                Phase 7 renders fields as read-only because the layout is the contract;
                live editing arrives with the POPIA/consent wiring in Phase 9A. */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                marginTop: 28,
                paddingTop: 20,
                borderTop: "1px solid var(--gl-border-subtle)",
              }}
            >
              <span className="gl-t-xs gl-muted">Edit mode ships in Phase 9A</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="gl-btn gl-btn--secondary" disabled>
                  Discard
                </button>
                <button type="button" className="gl-btn gl-btn--primary" disabled>
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
