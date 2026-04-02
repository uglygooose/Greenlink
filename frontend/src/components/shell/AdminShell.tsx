import type React from "react";

import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";

interface AdminShellProps {
  children: React.ReactNode;
  title: string | React.ReactNode;
  searchPlaceholder?: string;
}

export default function AdminShell({ children, title, searchPlaceholder }: AdminShellProps): JSX.Element {
  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <AdminTopbar title={title} searchPlaceholder={searchPlaceholder} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
