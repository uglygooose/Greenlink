(function (global) {
    "use strict";

    function normalizeAccountCode(raw) {
        const value = String(raw || "").trim();
        if (!value) return "";
        if (value.includes(" - ")) {
            return value.split(" - ")[0].trim();
        }
        return value;
    }

    global.GreenLinkAdminBookings = {
        normalizeAccountCode,
    };
})(window);
