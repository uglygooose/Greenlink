(function (global) {
    "use strict";

    function statusToClass(status) {
        switch (status) {
            case "checked_in":
                return "checked-in";
            case "no_show":
                return "no-show";
            default:
                return status || "";
        }
    }

    function statusToLabel(status) {
        return String(status || "").replaceAll("_", " ");
    }

    global.GreenLinkAdminDashboard = {
        statusToClass,
        statusToLabel,
    };
})(window);
