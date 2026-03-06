(function (global) {
    "use strict";

    function normalizePeopleView(raw, fallback = "members") {
        const value = String(raw || "").trim().toLowerCase();
        if (value === "members" || value === "guests" || value === "staff") return value;
        return String(fallback || "members");
    }

    global.GreenLinkAdminMembers = {
        normalizePeopleView,
    };
})(window);
