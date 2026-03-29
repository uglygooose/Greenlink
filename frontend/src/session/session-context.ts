import { createContext, useContext } from "react";

import type { SessionBootstrap, TokenResponse } from "../types/session";

export interface SessionContextValue {
  accessToken: string | null;
  bootstrap: SessionBootstrap | null;
  loading: boolean;
  initialized: boolean;
  login: (email: string, password: string) => Promise<TokenResponse>;
  logout: () => Promise<void>;
  refresh: () => Promise<TokenResponse>;
  reloadBootstrap: (selectedClubId?: string | null) => Promise<SessionBootstrap | null>;
  setSelectedClub: (selectedClubId: string | null) => Promise<void>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return context;
}
