(function (global) {
    "use strict";

    function readTtlCache(key, ttlMs) {
        try {
            const raw = global.localStorage.getItem(String(key || ""));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return null;
            const cachedAt = Number(parsed.cached_at || 0);
            if (!Number.isFinite(cachedAt) || cachedAt <= 0) return null;
            if ((Date.now() - cachedAt) > Number(ttlMs || 0)) return null;
            if (!parsed.data || typeof parsed.data !== "object") return null;
            return { cachedAt, data: parsed.data };
        } catch {
            return null;
        }
    }

    function writeTtlCache(key, data) {
        try {
            global.localStorage.setItem(
                String(key || ""),
                JSON.stringify({
                    cached_at: Date.now(),
                    data: data || {},
                })
            );
        } catch {
            // Ignore storage failures in restricted browsers.
        }
    }

    global.GreenLinkState = {
        readTtlCache,
        writeTtlCache,
    };
})(window);
