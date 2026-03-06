(function (global) {
    "use strict";

    function resolveProShopExportButton(hasRecords, alreadyExported) {
        if (!hasRecords) {
            return { disabled: true, label: "Export Pro Shop (CSV)" };
        }
        return {
            disabled: false,
            label: alreadyExported ? "Re-export Pro Shop (CSV)" : "Export Pro Shop (CSV)",
        };
    }

    global.GreenLinkAdminCashbook = {
        resolveProShopExportButton,
    };
})(window);
