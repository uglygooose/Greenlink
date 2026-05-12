// Path: frontend/src/components/admin-shell/AdminShell.tsx — Phase 7 admin chrome.
// Replaces the legacy frontend/src/components/shell/AdminShell.tsx (deleted in
// Phase 7). Sidebar + topbar + scrollable main, all wrapped in the .gl token
// scope so admin routes use the Phase 6 design system.
import type { ReactNode } from "react";

import { AdminSidebar } from "./AdminSidebar";
import { AdminTopBar, type AdminTopBarProps } from "./AdminTopBar";

interface AdminShellProps extends AdminTopBarProps {
  children: ReactNode;
}

export function AdminShell({ children, ...topbarProps }: AdminShellProps): JSX.Element {
  return (
    <div
      className="gl"
      style={{ minHeight: "100vh", display: "flex", overflow: "hidden", background: "var(--gl-surface)" }}
    >
      <AdminSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <AdminTopBar {...topbarProps} />
        <main style={{ flex: 1, overflow: "auto" }}>{children}</main>
      </div>
    </div>
  );
}
