(function (global) {
    "use strict";

    const BOOTSTRAP_KEY = "greenlink.session.bootstrap.v2";
    const AUTH_KEYS = ["token", "user_role", "active_club_id"];
    const CLEARABLE_PREFIXES = [
        "greenlink.",
        "greenlink_",
    ];
    const CLEARABLE_KEYS = new Set([
        "dashboard_period_view",
        "dashboard_stream_view",
        "last_payment_method",
    ]);

    function readBootstrap() {
        try {
            const raw = global.sessionStorage.getItem(BOOTSTRAP_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch {
            return null;
        }
    }

    function writeBootstrap(payload) {
        try {
            global.sessionStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(payload || {}));
        } catch {
            // Ignore storage failures.
        }

        try {
            const effectiveClubId = Number(payload?.effective_club?.id || 0);
            const previewClubId = Number(payload?.preview_club?.id || 0);
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

    async function fetchBootstrap(query = "") {
        const suffix = String(query || "").trim();
        const response = await global.fetch(`/api/session/bootstrap${suffix}`, {
            headers: authHeaders(),
            cache: "no-store",
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
            const error = new Error(String(detail));
            error.status = response.status;
            throw error;
        }
        return data;
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
        try {
            global.sessionStorage.removeItem(BOOTSTRAP_KEY);
        } catch {
            // Ignore storage failures.
        }
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
        fetchBootstrap,
        readBootstrap,
        setAuthSession,
        writeBootstrap,
    };
})(window);
