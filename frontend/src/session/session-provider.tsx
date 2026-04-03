import { type ReactNode, useEffect, useState } from "react";

import * as authApi from "../api/auth";
import { ApiError } from "../api/client";
import { fetchBootstrap } from "../api/session";
import {
  AUTH_TOKEN_CHANGED_EVENT,
  SESSION_EXPIRED_EVENT,
  getAccessToken,
  getSelectedClubId,
  setAccessToken as persistAccessToken,
  setSelectedClubId,
} from "../auth/token-storage";
import type { SessionBootstrap, TokenResponse } from "../types/session";
import { SessionContext, type SessionContextValue } from "./session-context";

interface Props {
  children: ReactNode;
}

export function SessionProvider({ children }: Props): JSX.Element {
  const [accessToken, setAccessTokenState] = useState<string | null>(() => getAccessToken());
  const [bootstrap, setBootstrap] = useState<SessionBootstrap | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setInitialized(true);
      return;
    }
    const selectedClubId = getSelectedClubId();
    const token = accessToken;

    void (async () => {
      setLoading(true);
      try {
        const data = await fetchBootstrap(token, selectedClubId);
        setBootstrap(data);
        setInitialized(true);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          const refreshed = await authApi.refresh();
          setAccessToken(refreshed.access_token);
          const data = await fetchBootstrap(refreshed.access_token, selectedClubId);
          setBootstrap(data);
          setInitialized(true);
          return;
        }
        throw error;
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken]);

  useEffect(() => {
    function handleTokenChanged(): void {
      const nextToken = getAccessToken();
      setAccessTokenState(nextToken);
      if (!nextToken) {
        setBootstrap(null);
        setLoading(false);
        setInitialized(true);
      }
    }

    function handleSessionExpired(): void {
      setAccessTokenState(null);
      setBootstrap(null);
      setLoading(false);
      setInitialized(true);
    }

    window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, handleTokenChanged);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, handleTokenChanged);
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, []);

  async function login(email: string, password: string): Promise<TokenResponse> {
    const result = await authApi.login({ email, password });
    setAccessToken(result.access_token);
    await loadBootstrap(getSelectedClubId(), result.access_token);
    return result;
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout(accessToken);
    } finally {
      setAccessToken(null);
      setBootstrap(null);
      setSelectedClubId(null);
      setInitialized(true);
    }
  }

  async function refresh(): Promise<TokenResponse> {
    const result = await authApi.refresh();
    setAccessToken(result.access_token);
    return result;
  }

  async function loadBootstrap(
    selectedClubId: string | null = getSelectedClubId(),
    tokenOverride?: string,
  ): Promise<SessionBootstrap | null> {
    const token = tokenOverride ?? accessToken;
    if (!token) {
      setInitialized(true);
      return null;
    }

    setLoading(true);
    try {
      const data = await fetchBootstrap(token, selectedClubId);
      setBootstrap(data);
      setInitialized(true);
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        const refreshed = await refresh();
        const data = await fetchBootstrap(refreshed.access_token, selectedClubId);
        setBootstrap(data);
        setInitialized(true);
        return data;
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }

  async function changeSelectedClub(selectedClub: string | null): Promise<void> {
    setSelectedClubId(selectedClub);
    await loadBootstrap(selectedClub);
  }

  function setAccessToken(token: string | null): void {
    setAccessTokenState(token);
    persistAccessToken(token);
  }

  const value: SessionContextValue = {
    accessToken,
    bootstrap,
    loading,
    initialized,
    login,
    logout,
    refresh,
    reloadBootstrap: loadBootstrap,
    setSelectedClub: changeSelectedClub
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
