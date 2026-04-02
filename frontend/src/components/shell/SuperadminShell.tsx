import type React from "react";

import SuperadminSidebar from "./SuperadminSidebar";
import SuperadminTopbar from "./SuperadminTopbar";

interface SuperadminShellProps {
  children: React.ReactNode;
  title: string | React.ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

export default function SuperadminShell({
  children,
  title,
  searchPlaceholder,
  searchValue,
  onSearchChange,
}: SuperadminShellProps): JSX.Element {
  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <SuperadminSidebar />
      <div className="ml-72 flex min-h-screen flex-1 flex-col">
        <SuperadminTopbar
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          searchValue={searchValue}
          title={title}
        />
        <main className="flex-1 px-8 pb-8">{children}</main>
      </div>
    </div>
  );
}
