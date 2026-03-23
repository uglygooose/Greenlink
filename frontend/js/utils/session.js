(function (global) {
    "use strict";

    const BOOTSTRAP_KEY = "greenlink.session.bootstrap.v2";
    const AUTH_KEYS = ["token", "user_role", "active_club_id"];
    const BOOTSTRAP_TIMEOUT_MS = 12000;
    const VALID_ROLE_SHELLS = new Set(["super_admin", "club_admin", "staff", "member"]);
    const CLEARABLE_PREFIXES = [
        "greenlink.",
        "greenlink_",
    ];
    const CLEARABLE_KEYS = new Set([
        "dashboard_period_view",
        "dashboard_stream_view",
        "last_payment_method",
    ]);

    function sessionError(message, extra = {}) {
        const error = new Error(String(message || "Session error"));
        Object.assign(error, extra || {});
        return error;
    }

    function positiveInt(value) {
        const number = Number(value);
        return Number.isInteger(number) && number > 0 ? number : null;
    }

    function normalizeClubPayload(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const id = positiveInt(value.id);
        if (!id) return null;
        return {
            ...value,
            id,
        };
    }

    function normalizeBootstrapPayload(payload) {
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            throw sessionError("Session bootstrap returned an invalid payload.", { code: "INVALID_BOOTSTRAP" });
        }

        const roleShell = String(payload.role_shell || "").trim().toLowerCase();
        const defaultWorkspace = String(payload.default_workspace || "").trim().toLowerCase();
        const landingPath = String(payload.landing_path || "").trim();
        const allowedWorkspaces = Array.isArray(payload.allowed_workspaces)
            ? payload.allowed_workspaces.map(item => String(item || "").trim().toLowerCase()).filter(Boolean)
            : [];
        const user = payload.user;
        const userId = positiveInt(user?.id);
        const userEmail = String(user?.email || "").trim().toLowerCase();
        const userName = String(user?.name || "").trim() || userEmail;
        const userRole = String(user?.role || "").trim().toLowerCase();
        const effectiveClub = normalizeClubPayload(payload.effective_club);
        const previewClub = normalizeClubPayload(payload.preview_club);

        if (!VALID_ROLE_SHELLS.has(roleShell)) {
            throw sessionError("Session bootstrap returned an unknown role shell.", { code: "INVALID_BOOTSTRAP" });
        }
        if (!user || typeof user !== "object" || !userId || !userEmail) {
            throw sessionError("Session bootstrap is missing user identity.", { code: "INVALID_BOOTSTRAP" });
        }
        if (!defaultWorkspace) {
            throw sessionError("Session bootstrap did not include a default workspace.", { code: "INVALID_BOOTSTRAP" });
        }
        if (!landingPath.startsWith("/")) {
            throw sessionError("Session bootstrap returned an invalid landing path.", { code: "INVALID_BOOTSTRAP" });
        }
        if (!allowedWorkspaces.length) {
            throw sessionError("Session bootstrap did not include allowed workspaces.", { code: "INVALID_BOOTSTRAP" });
        }
        if (roleShell !== "super_admin" && !effectiveClub) {
            throw sessionError("Session bootstrap did not resolve a club context.", { code: "INVALID_BOOTSTRAP" });
        }

        return {
            ...payload,
            user: {
                ...user,
                id: userId,
                email: userEmail,
                name: userName,
                role: userRole,
            },
            role_shell: roleShell,
            default_workspace: defaultWorkspace,
            landing_path: landingPath,
            allowed_workspaces: allowedWorkspaces,
            club_context_locked: Boolean(payload.club_context_locked),
            effective_club: effectiveClub,
            preview_club: previewClub,
            cache_scope_key: String(payload.cache_scope_key || "").trim(),
        };
    }

    function discardBootstrap() {
        try {
            global.sessionStorage.removeItem(BOOTSTRAP_KEY);
        } catch {
            // Ignore storage failures.
        }

        try {
            global.localStorage.removeItem("active_club_id");
        } catch {
            // Ignore storage failures.
        }
    }

    function readBootstrap() {
        try {
            const raw = global.sessionStorage.getItem(BOOTSTRAP_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return normalizeBootstrapPayload(parsed);
        } catch {
            discardBootstrap();
            return null;
        }
    }

    function writeBootstrap(payload) {
        const normalized = normalizeBootstrapPayload(payload);

        try {
            global.sessionStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(normalized));
        } catch {
            // Ignore storage failures.
        }

        try {
            if (normalized?.user?.role) {
                global.localStorage.setItem("user_role", String(normalized.user.role));
            }
            const effectiveClubId = Number(normalized?.effective_club?.id || 0);
            const previewClubId = Number(normalized?.preview_club?.id || 0);
            if (effectiveClubId > 0) {
                global.localStorage.setItem("active_club_id", String(effectiveClubId));
            } else if (previewClubId > 0) {
                global.localStorage.setItem("active_club_id", String(previewClubId));
            } else {
                global.localStorage.removeItem("active_club_id");
            }
        } catch {
            // Ignore storage failures.
        }

        return normalized;
    }

    function setAuthSession(token, role) {
        global.localStorage.setItem("token", String(token || ""));
        global.localStorage.setItem("user_role", String(role || ""));
    }

    function authHeaders(extraHeaders) {
        const headers = new Headers(extraHeaders || {});
        const token = global.localStorage.getItem("token");
        if (token && !headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${token}`);
        }
        return headers;
    }

    async function fetchBootstrap(query = "", options = {}) {
        const suffix = String(query || "").trim();
        const requestedTimeoutMs = Number(options.timeoutMs);
        const timeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
            ? requestedTimeoutMs
            : BOOTSTRAP_TIMEOUT_MS;
        const controller = new AbortController();
        let timedOut = false;
        let abortedByExternal = false;
        const timeoutId = timeoutMs > 0
            ? global.setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, timeoutMs)
            : null;

        const externalSignal = options.signal;
        let onAbort = null;
        if (externalSignal) {
            if (externalSignal.aborted) {
                abortedByExternal = true;
                controller.abort();
            } else {
                onAbort = () => {
                    abortedByExternal = true;
                    controller.abort();
                };
                externalSignal.addEventListener("abort", onAbort, { once: true });
            }
        }

        try {
            const response = await global.fetch(`/api/session/bootstrap${suffix}`, {
                headers: authHeaders({ Accept: "application/json" }),
                cache: "no-store",
                signal: controller.signal,
            });
            const raw = await response.text();
            let data = null;
            try {
                data = raw ? JSON.parse(raw) : null;
            } catch {
                data = null;
            }
            if (!response.ok) {
                const detail = data?.detail || raw || "Session bootstrap failed";
                throw sessionError(String(detail), {
                    code: "BOOTSTRAP_HTTP_ERROR",
                    status: response.status,
                    data,
                });
            }
            return normalizeBootstrapPayload(data);
        } catch (error) {
            if (error?.name === "AbortError") {
                if (abortedByExternal) throw error;
                if (timedOut) {
                    throw sessionError(`Session bootstrap timed out after ${timeoutMs}ms.`, {
                        code: "BOOTSTRAP_TIMEOUT",
                    });
                }
            }
            if (error?.code) throw error;
            throw sessionError(error?.message || "Session bootstrap failed.", {
                code: "BOOTSTRAP_FETCH_ERROR",
                cause: error,
            });
        } finally {
            if (timeoutId != null) {
                global.clearTimeout(timeoutId);
            }
            if (externalSignal && onAbort) {
                externalSignal.removeEventListener("abort", onAbort);
            }
        }
    }

    function clearUiCaches() {
        try {
            const keys = [];
            for (let i = 0; i < global.localStorage.length; i += 1) {
                const key = global.localStorage.key(i);
                if (!key) continue;
                const shouldClear = CLEARABLE_KEYS.has(key)
                    || CLEARABLE_PREFIXES.some(prefix => key.startsWith(prefix));
                if (shouldClear && !AUTH_KEYS.includes(key)) {
                    keys.push(key);
                }
            }
            keys.forEach(key => global.localStorage.removeItem(key));
        } catch {
            // Ignore storage failures.
        }
    }

    function clearSessionState() {
        AUTH_KEYS.forEach(key => {
            try {
                global.localStorage.removeItem(key);
            } catch {
                // Ignore storage failures.
            }
        });
        discardBootstrap();
        clearUiCaches();
        try {
            global.Greenlink?.invalidateClubConfigCache?.();
        } catch {
            // Ignore cache invalidation failures.
        }
    }

    global.GreenLinkSession = {
        authHeaders,
        clearSessionState,
        discardBootstrap,
        fetchBootstrap,
        normalizeBootstrapPayload,
        readBootstrap,
        setAuthSession,
        writeBootstrap,
    };
})(window);
