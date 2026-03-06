(function (global) {
    "use strict";

    function safeText(value, fallback = "") {
        const text = String(value ?? "").trim();
        return text || String(fallback ?? "");
    }

    function numberOr(value, fallback = 0) {
        const num = Number(value);
        return Number.isFinite(num) ? num : Number(fallback || 0);
    }

    global.GreenLinkAdminShared = {
        safeText,
        numberOr,
    };
})(window);
