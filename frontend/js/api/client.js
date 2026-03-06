(function (global) {
    "use strict";

    function _buildUrl(baseUrl, path) {
        const base = String(baseUrl || global.location.origin).replace(/\/+$/, "");
        const suffix = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
        return `${base}${suffix}`;
    }

    function create(options = {}) {
        const baseUrl = String(options.baseUrl || global.location.origin);
        const request = global.GreenLinkRequest;
        if (!request || typeof request.fetchJson !== "function") {
            throw new Error("GreenLinkRequest is required before GreenLinkApiClient.");
        }

        return {
            getJson(path, init) {
                return request.fetchJson(_buildUrl(baseUrl, path), init);
            },
            postJson(path, body, init = {}) {
                return request.fetchJson(_buildUrl(baseUrl, path), {
                    ...init,
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(init.headers || {}),
                    },
                    body: JSON.stringify(body || {}),
                });
            },
            putJson(path, body, init = {}) {
                return request.fetchJson(_buildUrl(baseUrl, path), {
                    ...init,
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        ...(init.headers || {}),
                    },
                    body: JSON.stringify(body || {}),
                });
            },
            deleteJson(path, init) {
                return request.fetchJson(_buildUrl(baseUrl, path), {
                    ...(init || {}),
                    method: "DELETE",
                });
            },
        };
    }

    global.GreenLinkApiClient = { create };
})(window);
