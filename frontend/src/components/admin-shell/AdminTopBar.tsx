// Path: frontend/src/components/admin-shell/AdminTopBar.tsx — Phase 8 admin chrome.
// 52-px topbar with breadcrumb above title + search + actions. Replaces the
// Phase 7 64-px topbar after Slice 1 reconciliation against the Phase 8 design.
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
        height: 52,
        borderBottom: "1px solid var(--gl-border-subtle)",
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 16,
        background: "var(--gl-surface)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 10,
              color: "var(--gl-text-secondary)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: 3,
            }}
          >
            {breadcrumbs.map((crumb, i) => (
              <span key={`${crumb}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {i > 0 ? <Icon name="chevron_right" size={11} color="var(--gl-text-secondary)" /> : null}
                <span>{crumb}</span>
              </span>
            ))}
          </div>
        ) : null}
        <div
          className="gl-serif"
          style={{
            fontSize: 19,
            fontWeight: 500,
            letterSpacing: "-0.012em",
          }}
        >
          {title}
        </div>
      </div>

      <div style={{ flex: 1, maxWidth: 320, marginLeft: 16 }}>
        <label className="gl-input" style={{ paddingLeft: 10, height: 30, fontSize: 12 }}>
          <Icon name="search" size={14} color="var(--gl-text-secondary)" />
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
              fontSize: 12,
              padding: 0,
            }}
            placeholder={searchPlaceholder}
          />
          <span className="gl-kbd" style={{ height: 16, fontSize: 10 }} aria-hidden="true">
            ⌘K
          </span>
        </label>
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          className="gl-btn gl-btn--secondary"
          data-size="sm"
          style={{ height: 28, padding: "0 8px" }}
          disabled
          aria-label="Notifications — ships in Phase 9E"
        >
          <Icon name="notifications" size={14} />
        </button>
        <button
          type="button"
          className="gl-btn gl-btn--secondary"
          data-size="sm"
          style={{ height: 28, padding: "0 8px" }}
          disabled
          aria-label="Shortcuts — ships in Phase 10 (tee sheet)"
          title="Press ? for shortcuts"
        >
          <span className="gl-kbd" style={{ height: 16, fontSize: 10 }} aria-hidden="true">
            ?
          </span>
        </button>
      </div>
    </header>
  );
}
