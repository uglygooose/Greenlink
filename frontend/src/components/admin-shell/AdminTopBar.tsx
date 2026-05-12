// Path: frontend/src/components/admin-shell/AdminTopBar.tsx — Phase 7 admin chrome.
// Replaces the legacy frontend/src/components/shell/AdminTopbar.tsx (deleted in
// Phase 7). Ports the prototype's 64px top bar with title + search + actions.
import type { ReactNode } from "react";

import { Icon } from "../ui/Icon";

export interface AdminTopBarProps {
  title: ReactNode;
  breadcrumbs?: string[];
  searchPlaceholder?: string;
}

export function AdminTopBar({
  title,
  breadcrumbs,
  searchPlaceholder = "Search members, GL codes, dates…",
}: AdminTopBarProps): JSX.Element {
  return (
    <header
      style={{
        height: 64,
        borderBottom: "1px solid var(--gl-border-subtle)",
        display: "flex",
        alignItems: "center",
        padding: "0 28px",
        gap: 20,
        background: "var(--gl-surface)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "var(--gl-text-secondary)",
              letterSpacing: "0.04em",
            }}
          >
            {breadcrumbs.map((crumb, i) => (
              <span key={`${crumb}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {i > 0 ? <Icon name="chevron_right" size={12} color="var(--gl-text-secondary)" /> : null}
                <span>{crumb}</span>
              </span>
            ))}
          </div>
        ) : null}
        <div
          className="gl-serif"
          style={{
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            marginTop: breadcrumbs && breadcrumbs.length > 0 ? 2 : 0,
          }}
        >
          {title}
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: 420, marginLeft: 24 }}>
        <label className="gl-input" style={{ paddingLeft: 12, height: 36 }}>
          <Icon name="search" size={16} color="var(--gl-text-secondary)" />
          <input
            type="search"
            aria-label="Search"
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: "transparent",
              color: "inherit",
              font: "inherit",
              fontSize: 13,
              padding: 0,
            }}
            placeholder={searchPlaceholder}
          />
          <span className="gl-kbd" aria-hidden="true">
            ⌘K
          </span>
        </label>
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <button type="button" className="gl-btn gl-btn--secondary" data-size="sm" disabled aria-label="New booking — ships in Phase 10">
          <Icon name="add" size={14} />
          New booking
        </button>
        <button
          type="button"
          className="gl-btn gl-btn--secondary"
          data-size="sm"
          style={{ padding: "0 10px" }}
          disabled
          aria-label="Notifications — ships in Phase 9E"
        >
          <Icon name="notifications" size={16} />
        </button>
        <button
          type="button"
          className="gl-btn gl-btn--secondary"
          data-size="sm"
          style={{ padding: "0 10px" }}
          aria-label="Help"
          disabled
        >
          <Icon name="help_outline" size={16} />
        </button>
      </div>
    </header>
  );
}
