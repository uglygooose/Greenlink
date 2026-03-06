(function (global) {
    "use strict";

    function normalizeGolfDayPaymentStatus(raw, fallback = "pending") {
        const value = String(raw || "").trim().toLowerCase();
        if (value === "pending" || value === "partial" || value === "paid" || value === "cancelled") {
            return value;
        }
        return String(fallback || "pending");
    }

    global.GreenLinkAdminGolfDayBookings = {
        normalizeGolfDayPaymentStatus,
    };
})(window);
