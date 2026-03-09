(function (global) {
    "use strict";

    const DEFAULT_TIMEOUT_MS = 15000;
    const DEFAULT_RETRY_ATTEMPTS = 2;
    const DEFAULT_RETRY_BASE_MS = 320;
    let authFetchInstalled = false;

    function delayMs(ms) {
        const wait = Math.max(0, Number(ms || 0));
        return new Promise((resolve) => global.setTimeout(resolve, wait));
    }

    function parseRetryAfterMs(response) {
        const raw = String(response?.headers?.get?.("Retry-After") || "").trim();
        if (!raw) return 0;
        const seconds = Number(raw);
        if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
        const at = Date.parse(raw);
        if (!Number.isFinite(at)) return 0;
        return Math.max(0, at - Date.now());
    }

    function isRetryableMethod(method) {
        const m = String(method || "").toUpperCase();
        return m === "GET" || m === "HEAD" || m === "OPTIONS";
    }

    function isRetryableStatus(status) {
        const code = Number(status || 0);
        return code === 408 || code === 429 || code >= 500;
    }

    function installAuthFetch(options = {}) {
        if (authFetchInstalled) return;
        authFetchInstalled = true;

        const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
        const retryAttempts = Number(options.retryAttempts || DEFAULT_RETRY_ATTEMPTS);
        const retryBaseMs = Number(options.retryBaseMs || DEFAULT_RETRY_BASE_MS);
        const getCurrentUserRole = typeof options.getCurrentUserRole === "function" ? options.getCurrentUserRole : () => null;

        const originalFetch = global.fetch.bind(global);
        global.fetch = async (input, init) => {
            const token = global.localStorage.getItem("token");
            if (!token) return originalFetch(input, init);

            let url = "";
            if (typeof input === "string") url = input;
            else if (input && typeof input.url === "string") url = input.url;

            try {
                const resolved = new URL(url, global.location.origin);
                if (resolved.origin !== global.location.origin) {
                    return originalFetch(input, init);
                }
            } catch {
                return originalFetch(input, init);
            }

            const nextInit = init ? { ...init } : {};
            const requestedTimeoutMs = Number(nextInit.timeoutMs);
            if (Object.prototype.hasOwnProperty.call(nextInit, "timeoutMs")) {
                delete nextInit.timeoutMs;
            }
            const headers = new Headers(nextInit.headers || {});
            if (!headers.has("Authorization")) {
                headers.set("Authorization", `Bearer ${token}`);
            }

            const activeClubId = global.localStorage.getItem("active_club_id");
            if (String(getCurrentUserRole() || "") === "super_admin" && activeClubId && !headers.has("X-Club-Id")) {
                headers.set("X-Club-Id", String(activeClubId));
            }

            nextInit.headers = headers;
            const method = String(
                nextInit.method
                || (input && typeof input.method === "string" ? input.method : "GET")
                || "GET"
            ).toUpperCase();
            const canRetry = isRetryableMethod(method);
            const maxAttempts = canRetry ? (retryAttempts + 1) : 1;
            const effectiveTimeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
                ? requestedTimeoutMs
                : timeoutMs;

            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                const controller = new AbortController();
                let timedOut = false;
                let abortedByExternal = false;
                const timeoutId = effectiveTimeoutMs > 0
                    ? global.setTimeout(() => {
                        timedOut = true;
                        controller.abort();
                    }, effectiveTimeoutMs)
                    : null;

                const externalSignal = nextInit.signal;
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
                    const response = await originalFetch(input, { ...nextInit, signal: controller.signal });
                    if (!canRetry || !isRetryableStatus(response.status) || attempt >= (maxAttempts - 1)) {
                        return response;
                    }
                    const retryDelay = Math.max(
                        parseRetryAfterMs(response),
                        Math.round(retryBaseMs * Math.pow(2, attempt))
                    );
                    await delayMs(retryDelay);
                } catch (error) {
                    if (error?.name === "AbortError") {
                        if (abortedByExternal) {
                            throw error;
                        }
                        if (timedOut) {
                            const timeoutError = new Error(`Request timed out after ${effectiveTimeoutMs}ms`);
                            timeoutError.name = "TimeoutError";
                            timeoutError.cause = error;
                            throw timeoutError;
                        }
                        throw error;
                    }
                    const transient = error instanceof TypeError;
                    if (!canRetry || !transient || attempt >= (maxAttempts - 1)) {
                        throw error;
                    }
                    await delayMs(Math.round(retryBaseMs * Math.pow(2, attempt)));
                } finally {
                    if (timeoutId != null) {
                        global.clearTimeout(timeoutId);
                    }
                    if (externalSignal && onAbort) {
                        externalSignal.removeEventListener("abort", onAbort);
                    }
                }
            }

            return originalFetch(input, nextInit);
        };
    }

    async function fetchJson(url, options) {
        const response = await global.fetch(url, options);
        const raw = await response.text();
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch {
            data = null;
        }
        if (!response.ok) {
            const msg = (data && (data.detail || data.message))
                ? (data.detail || data.message)
                : (raw || response.statusText || "Request failed");
            const err = new Error(msg);
            err.status = response.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    global.GreenLinkRequest = {
        delayMs,
        parseRetryAfterMs,
        isRetryableMethod,
        isRetryableStatus,
        installAuthFetch,
        fetchJson,
    };
})(window);
