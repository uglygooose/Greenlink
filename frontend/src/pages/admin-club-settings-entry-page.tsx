import { Navigate } from "react-router-dom";

import { AdminClubSettingsPage } from "./admin-club-settings-page";
import { useSession } from "../session/session-context";

export function AdminClubSettingsEntryPage(): JSX.Element {
  const { bootstrap } = useSession();
  const uxRebuildV1 = bootstrap?.feature_flags?.ux_rebuild_v1 === true;

  if (uxRebuildV1) {
    return <Navigate replace to="/admin/settings" />;
  }

  return <AdminClubSettingsPage />;
}
