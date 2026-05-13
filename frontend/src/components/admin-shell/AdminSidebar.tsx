// Path: frontend/src/components/admin-shell/AdminSidebar.tsx — Phase 7 admin chrome.
// Replaces the legacy frontend/src/components/shell/AdminSidebar.tsx (deleted in
// Phase 7). Nav structure ported verbatim from docs/phase6_prototype/surfaces.jsx.
// Items with no backing route are rendered as aria-disabled placeholders so the
// shell shows the prototype's full nav surface without misleading clicks.
import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { Wordmark } from "../ui/Wordmark";
import { useSession } from "../../session/session-context";

interface NavItemSpec {
  icon: string;
  label: string;
  to?: string;
  badge?: string;
  badgeKind?: "default" | "warn";
  comingPhase?: string;
}

interface NavGroupSpec {
  title: string;
  items: NavItemSpec[];
}

// Nav structure verbatim from the prototype. Items without `to` are disabled
// placeholders carrying a `comingPhase` tooltip noting which Phase ships them.
const NAV_GROUPS: NavGroupSpec[] = [
  {
    title: "Operate",
    items: [
      { icon: "dashboard", label: "Dashboard", to: "/admin/dashboard" },
      { icon: "calendar_month", label: "Tee sheet", to: "/admin/golf/tee-sheet" },
      { icon: "point_of_sale", label: "Point of sale", to: "/admin/pos-terminal" },
      { icon: "event_available", label: "Bookings", comingPhase: "Phase 10" },
      { icon: "groups", label: "Members", to: "/admin/members" },
    ],
  },
  {
    title: "Finance",
    items: [
      { icon: "receipt_long", label: "Daily close", to: "/admin/finance" },
      { icon: "account_balance", label: "Member ledger", comingPhase: "Phase 10" },
      { icon: "sync_alt", label: "Accounting", to: "/admin/finance/dashboard" },
      { icon: "rule", label: "Audit log", comingPhase: "Phase 9B" },
    ],
  },
  {
    title: "Club",
    items: [
      { icon: "golf_course", label: "Courses & pricing", to: "/admin/golf/settings" },
      { icon: "trending_up", label: "Handicaps", comingPhase: "Phase 11" },
      { icon: "emoji_events", label: "Competitions", comingPhase: "Phase 11" },
      { icon: "forum", label: "Communications", to: "/admin/communications" },
      { icon: "insights", label: "Reports", to: "/admin/reports" },
    ],
  },
];

function NavGroup({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 4 }}>
      <div
        style={{
          padding: "6px 10px 3px 10px",
          fontSize: 10,
          color: "var(--gl-text-secondary)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

interface NavItemProps {
  spec: NavItemSpec;
}

function NavItem({ spec }: NavItemProps): JSX.Element {
  const sharedStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "6px 10px",
    borderRadius: 5,
    color: active ? "var(--gl-text-primary)" : "var(--gl-text-secondary)",
    background: active ? "var(--gl-surface-raised)" : "transparent",
    fontSize: 12.5,
    fontWeight: active ? 500 : 400,
    textDecoration: "none",
    borderLeft: active ? "2px solid var(--gl-brand)" : "2px solid transparent",
    position: "relative" as const,
  });

  const iconColor = (active: boolean): string => (active ? "var(--gl-brand)" : "var(--gl-text-secondary)");

  if (!spec.to) {
    return (
      <span
        aria-disabled="true"
        title={`${spec.label} — ships in ${spec.comingPhase ?? "a later phase"}`}
        style={{
          ...sharedStyle(false),
          opacity: 0.55,
          cursor: "not-allowed",
        }}
      >
        <Icon name={spec.icon} size={15} color={iconColor(false)} />
        <span style={{ flex: 1 }}>{spec.label}</span>
        {spec.comingPhase ? (
          <span
            style={{
              fontSize: 9.5,
              padding: "1px 5px",
              borderRadius: 3,
              background: "var(--gl-surface-2)",
              color: "var(--gl-text-secondary)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            soon
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <NavLink
      to={spec.to}
      end={spec.to === "/admin/dashboard"}
      style={({ isActive }) => sharedStyle(isActive)}
    >
      {({ isActive }) => (
        <>
          <Icon name={spec.icon} size={15} color={iconColor(isActive)} />
          <span style={{ flex: 1 }}>{spec.label}</span>
          {spec.badge ? (
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 999,
                fontWeight: 500,
                background: spec.badgeKind === "warn" ? "var(--gl-caddie)" : "var(--gl-fog)",
                color: spec.badgeKind === "warn" ? "var(--gl-text-onaccent)" : "var(--gl-text-secondary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {spec.badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

export function AdminSidebar(): JSX.Element {
  const { bootstrap } = useSession();
  const user = bootstrap?.user;
  const club = bootstrap?.selected_club;
  // Derive initials from the user's display name; falls back to "GL".
  const initials = (user?.display_name ?? "GreenLink")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "GL";

  return (
    <aside
      aria-label="Primary navigation"
      style={{
        width: 220,
        background: "var(--gl-surface-2)",
        borderRight: "1px solid var(--gl-border-subtle)",
        padding: "16px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "6px 10px 16px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Wordmark size={18} color="var(--gl-text-primary)" />
        <Icon name="unfold_more" size={14} color="var(--gl-text-secondary)" />
      </div>

      <nav aria-label="Admin sections" style={{ display: "flex", flexDirection: "column" }}>
        {NAV_GROUPS.map((group) => (
          <NavGroup key={group.title} title={group.title}>
            {group.items.map((item) => (
              <NavItem key={item.label} spec={item} />
            ))}
          </NavGroup>
        ))}
      </nav>

      <div style={{ marginTop: "auto", padding: 6, display: "flex", flexDirection: "column", gap: 8 }}>
        <NavItem spec={{ icon: "settings", label: "Settings", to: "/admin/settings" }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 8px",
            borderRadius: 5,
            background: "var(--gl-surface-raised)",
            border: "1px solid var(--gl-border-subtle)",
          }}
        >
          <Avatar initials={initials} size={26} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {user?.display_name ?? "Signed in"}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--gl-text-secondary)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {club?.name ? `Admin · ${club.name}` : "GreenLink"}
            </div>
          </div>
          <Icon name="more_vert" size={14} color="var(--gl-text-secondary)" />
        </div>
      </div>
    </aside>
  );
}
