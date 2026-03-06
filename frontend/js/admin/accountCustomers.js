(function (global) {
    "use strict";

    function findByCode(rows, accountCode) {
        const bookingModule = global.GreenLinkAdminBookings || {};
        const normalize = typeof bookingModule.normalizeAccountCode === "function"
            ? bookingModule.normalizeAccountCode
            : (value) => String(value || "").trim();
        const code = normalize(accountCode).toLowerCase();
        if (!code) return null;
        const list = Array.isArray(rows) ? rows : [];
        return list.find((row) => String(row?.account_code || "").trim().toLowerCase() === code) || null;
    }

    global.GreenLinkAdminAccountCustomers = {
        findByCode,
    };
})(window);
