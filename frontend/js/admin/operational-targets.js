(function (global) {
    "use strict";

    function buildPayload(form, deps = {}) {
        const state = deps.state || {};
        const current = Array.isArray(state.workspaceData?.targets?.targets) ? state.workspaceData.targets.targets : [];
        return {
            year: Number(form.year.value || new Date().getFullYear()),
            targets: current.map(row => ({
                operation_key: row.operation_key,
                metric_key: row.metric_key,
                target_value: Number(form[`target__${row.operation_key}__${row.metric_key}`].value || 0),
                unit: row.unit,
                notes: row.notes || null,
            })),
        };
    }

    async function submitForm(form, deps = {}) {
        if (!(form instanceof deps.HTMLFormElement)) return;
        const payload = buildPayload(form, deps);
        await deps.postJson("/api/admin/operation-targets", payload, { method: "PUT", invalidateCache: false });
        deps.invalidateWorkspaceScope("settings", { panel: "targets" });
        deps.invalidateSummaryDrivenWorkspaceCaches();
        deps.invalidateWorkspaceScope("reports");
        deps.invalidateClubSummaryCaches({ includeDashboard: true, includeOperationalTargets: true });
        deps.showToast("Operational targets saved.", "ok");
        if (deps.state?.route?.workspace === "reports") {
            await deps.refreshActiveReportsWorkspace();
        } else {
            await deps.refreshActiveSettingsWorkspace();
        }
    }

    global.GreenLinkAdminOperationalTargets = {
        submitForm,
    };
})(window);
