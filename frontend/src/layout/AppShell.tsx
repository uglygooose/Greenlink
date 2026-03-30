import React from "react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-on-surface">
      <div className="flex">
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
