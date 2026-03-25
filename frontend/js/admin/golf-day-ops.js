(function (global) {
    "use strict";

    function currentRows(state) {
        return Array.isArray(state?.workspaceData?.golfDays?.bookings) ? state.workspaceData.golfDays.bookings : [];
    }

    function findRecord(state, golfDayBookingId) {
        return currentRows(state).find(row => Number(row.id) === Number(golfDayBookingId)) || null;
    }

    function lifecycle(row, deps = {}) {
        const paymentStatus = String(row?.payment_status || "").trim().toLowerCase() || "pending";
        const operationArea = String(row?.operation_area || "").trim().toLowerCase();
        const amount = deps.safeNumber(row?.amount || 0);
        const balanceDue = deps.safeNumber(row?.balance_due ?? amount);
        const hasAllocation = ["allocated", "completed"].includes(operationArea);
        const isCompleted = operationArea === "completed";
        if (paymentStatus === "cancelled") {
            return { stage: "Cancelled", tone: "bad", detail: "Event is cancelled and should be kept out of active operations." };
        }
        if (isCompleted) {
            return { stage: "Completed", tone: "ok", detail: "Setup, allocation, and settlement are complete." };
        }
        if (paymentStatus === "paid" && hasAllocation) {
            return { stage: "Ready to complete", tone: "warn", detail: "Allocated and settled. Close it out when the event is done." };
        }
        if (hasAllocation && paymentStatus === "partial") {
            return { stage: "Allocated, deposit taken", tone: "warn", detail: "Starts are reserved. Final balance still needs to be settled." };
        }
        if (hasAllocation) {
            return { stage: "Allocated", tone: "ok", detail: "Starts are reserved on the tee sheet. Settlement still needs attention." };
        }
        if (paymentStatus === "paid" || (amount > 0 && balanceDue <= 0)) {
            return { stage: "Settled", tone: "ok", detail: "Payment is complete. Allocate starts or close the event." };
        }
        if (paymentStatus === "partial" || deps.safeNumber(row?.deposit_amount || 0) > 0) {
            return { stage: "Deposit taken", tone: "warn", detail: "The event is partially paid. Allocate starts and settle the balance." };
        }
        return { stage: "Needs allocation", tone: "warn", detail: "Event setup exists, but allocation and payment completion are still open." };
    }

    function lifecyclePill(row, deps = {}) {
        const status = lifecycle(row, deps);
        return `<span class="status-pill ${deps.escapeHtml(status.tone)}">${deps.escapeHtml(status.stage)}</span>`;
    }

    function serializePayload(row, deps = {}, overrides = {}) {
        return {
            event_name: String(overrides.event_name ?? row?.event_name ?? "").trim(),
            contact_name: String(overrides.contact_name ?? row?.contact_name ?? "").trim() || null,
            event_date: String(overrides.event_date ?? row?.event_date ?? "").trim() || null,
            event_end_date: String(overrides.event_end_date ?? row?.event_end_date ?? "").trim() || null,
            invoice_reference: String(overrides.invoice_reference ?? row?.invoice_reference ?? "").trim() || null,
            account_customer_id: deps.positiveInt(overrides.account_customer_id ?? row?.account_customer_id),
            account_code: String(overrides.account_code ?? row?.account_code ?? "").trim() || null,
            amount: Number(overrides.amount ?? row?.amount ?? 0),
            balance_due: Number(overrides.balance_due ?? row?.balance_due ?? 0),
            deposit_amount: Number(overrides.deposit_amount ?? row?.deposit_amount ?? 0),
            deposit_received_date: String(overrides.deposit_received_date ?? row?.deposit_received_date ?? "").trim() || null,
            deposit_received_note: String(overrides.deposit_received_note ?? row?.deposit_received_note ?? "").trim() || null,
            full_payment_amount: Number(overrides.full_payment_amount ?? row?.full_payment_amount ?? 0),
            full_payment_date: String(overrides.full_payment_date ?? row?.full_payment_date ?? "").trim() || null,
            full_payment_note: String(overrides.full_payment_note ?? row?.full_payment_note ?? "").trim() || null,
            payment_status: String(overrides.payment_status ?? row?.payment_status ?? "pending").trim() || "pending",
            operation_area: String(overrides.operation_area ?? row?.operation_area ?? "").trim() || null,
            notes: String(overrides.notes ?? row?.notes ?? "").trim() || null,
        };
    }

    function invalidateCaches(deps = {}, date = null, options = {}) {
        deps.deleteSharedCacheKey(deps.golfDayBookingsCacheKey(deps.activeClubCacheKeyPart()));
        if (date) {
            deps.invalidateGolfWorkspaceCaches(date);
        }
        deps.invalidateGolfSharedData({
            date: date || undefined,
            includeTeeRows: Boolean(options.includeTeeRows),
            includeDashboard: true,
            includeAlerts: true,
            includeFinanceBase: true,
        });
    }

    function renderPanel(bundle, deps = {}) {
        const golfDays = bundle.golfDays || {};
        const rows = Array.isArray(golfDays.bookings) ? golfDays.bookings : [];
        const accountCustomers = Array.isArray(bundle.accountCustomers?.account_customers) ? bundle.accountCustomers.account_customers : [];
        const readyToComplete = rows.filter(row => lifecycle(row, deps).stage === "Ready to complete").length;
        const allocatedCount = rows.filter(row => ["allocated", "completed"].includes(String(row.operation_area || "").trim().toLowerCase())).length;
        return `
            ${deps.renderPageHero({
                title: "Golf Day Operations",
                copy: "Move events from setup to tee-sheet allocation and payment completion without losing current golf-day context.",
                workspace: "golf",
                subnavLabel: "Golf pages",
                metrics: [
                    { label: "Open Events", value: deps.formatInteger(golfDays.total || 0), meta: "Current golf-day bookings" },
                    { label: "Pipeline Value", value: deps.formatCurrency(golfDays.total_amount || 0), meta: "Gross booked value" },
                    { label: "Allocated", value: deps.formatInteger(allocatedCount), meta: "Events already reserved on the tee sheet" },
                    { label: "Ready to Complete", value: deps.formatInteger(readyToComplete), meta: "Settled and allocated events ready to close" },
                ],
            })}
            <section class="card">
                <div class="panel-head">
                    <div>
                        <h4>Active event queue</h4>
                        <p>Open golf-day events stay visible here first until setup, payment, and allocation all reach a clean state.</p>
                    </div>
                </div>
                <div class="stack">
                    ${rows.length ? rows.map(row => `
                        <div class="list-row">
                            <div class="list-row-top">
                                <span class="list-title">${deps.escapeHtml(`${row.event_name || "Golf day"} #${row.id || "-"}`)}</span>
                                <div class="inline-actions">
                                    ${deps.renderStatusPill("", row.payment_status || "pending")}
                                    ${lifecyclePill(row, deps)}
                                </div>
                            </div>
                            <div class="inline-actions">
                                <button type="button" class="button secondary" data-edit-golf-day="${deps.escapeHtml(String(row.id))}">Edit event</button>
                                <button type="button" class="button ghost" data-load-golf-day-allocation="${deps.escapeHtml(String(row.id))}">Load allocation</button>
                                ${String(row.payment_status || "").trim().toLowerCase() === "paid" ? "" : `<button type="button" class="button ghost" data-golf-day-mark-paid="${deps.escapeHtml(String(row.id))}">Settle paid</button>`}
                                ${lifecycle(row, deps).stage === "Ready to complete" ? `<button type="button" class="button ghost" data-golf-day-complete="${deps.escapeHtml(String(row.id))}">Mark complete</button>` : ""}
                            </div>
                            <div class="list-meta">${deps.escapeHtml(`${deps.formatDate(row.event_date)} · ${deps.formatCurrency(row.amount || 0)} · ${row.contact_name || "No contact set"}`)}</div>
                            <div class="list-meta">${deps.escapeHtml(lifecycle(row, deps).detail)}</div>
                        </div>
                    `).join("") : `<div class="empty-state">No golf-day bookings yet.</div>`}
                </div>
            </section>
            <section class="split-grid">
                <form class="form-card" id="golf-day-form">
                    <div class="panel-head">
                        <div>
                            <h3>Event setup</h3>
                            <p>Create or update the event record before allocating starts to the tee sheet.</p>
                        </div>
                    </div>
                    <div class="field-grid">
                        <div class="field"><label>Existing Event ID</label><input name="golf_day_booking_id" type="number" min="1" placeholder="Leave blank to create"></div>
                        <div class="field"><label>Event Name</label><input name="event_name" required></div>
                        <div class="field"><label>Contact Name</label><input name="contact_name"></div>
                        <div class="field"><label>Event Date</label><input name="event_date" type="date"></div>
                        <div class="field"><label>End Date</label><input name="event_end_date" type="date"></div>
                        <div class="field"><label>Invoice Reference</label><input name="invoice_reference"></div>
                        <div class="field">
                            <label>Account Customer</label>
                            <select name="account_customer_id">
                                <option value="">None selected</option>
                                ${accountCustomers.map(row => `<option value="${deps.escapeHtml(String(row.id))}">${deps.escapeHtml(row.name || row.account_code || "Account")}</option>`).join("")}
                            </select>
                        </div>
                        <div class="field"><label>Account Code</label><input name="account_code"></div>
                        <div class="field"><label>Amount</label><input name="amount" type="number" min="0" step="0.01" value="0"></div>
                        <div class="field"><label>Balance Due</label><input name="balance_due" type="number" min="0" step="0.01" value="0"></div>
                        <div class="field"><label>Deposit</label><input name="deposit_amount" type="number" min="0" step="0.01" value="0"></div>
                        <div class="field"><label>Full Payment</label><input name="full_payment_amount" type="number" min="0" step="0.01" value="0"></div>
                        <div class="field">
                            <label>Payment Status</label>
                            <select name="payment_status">
                                <option value="pending">Pending</option>
                                <option value="partial">Partial</option>
                                <option value="paid">Paid</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                        <div class="field"><label>Notes</label><textarea name="notes"></textarea></div>
                    </div>
                    <div class="button-row">
                        <button type="submit" class="button">Save golf day</button>
                        <button type="button" class="button secondary" data-clear-golf-day-form="1">Clear</button>
                    </div>
                </form>
                <form class="form-card" id="golf-day-allocation-form">
                    <div class="panel-head">
                        <div>
                            <h3>Allocate to Tee Sheet</h3>
                            <p>Use the existing bulk-book flow to reserve starts for the selected golf day.</p>
                        </div>
                    </div>
                    <div class="field-grid">
                        <div class="field"><label>Event ID</label><input name="golf_day_booking_id" type="number" min="1" placeholder="Optional link to an existing event"></div>
                        <div class="field"><label>Group Name</label><input name="group_name" required></div>
                        <div class="field"><label>Date</label><input name="date" type="date" value="${deps.escapeHtml(bundle.date)}"></div>
                        <div class="field"><label>Start Time</label><input name="start_time" type="time" value="07:00"></div>
                        <div class="field"><label>End Time</label><input name="end_time" type="time" value="11:00"></div>
                        <div class="field"><label>Tees</label><input name="tees" value="1,10"></div>
                        <div class="field"><label>Slots per Time</label><input name="slots_per_time" type="number" min="1" max="4" value="4"></div>
                        <div class="field">
                            <label>Holes</label>
                            <select name="holes">
                                <option value="18">18</option>
                                <option value="9">9</option>
                            </select>
                        </div>
                        <div class="field"><label>Account Code</label><input name="account_code"></div>
                        <div class="field"><label>Price per Slot</label><input name="price" type="number" min="0" step="0.01" value="0"></div>
                    </div>
                    <div class="button-row">
                        <button type="submit" class="button">Allocate starts</button>
                        <button type="button" class="button secondary" data-clear-golf-day-allocation-form="1">Clear</button>
                    </div>
                </form>
            </section>
        `;
    }

    function resetForm(form = global.document.getElementById("golf-day-form")) {
        if (!(form instanceof global.HTMLFormElement)) return;
        form.reset();
        if (form.golf_day_booking_id) form.golf_day_booking_id.value = "";
        if (form.payment_status) form.payment_status.value = "pending";
        if (form.amount) form.amount.value = "0";
        if (form.balance_due) form.balance_due.value = "0";
        if (form.deposit_amount) form.deposit_amount.value = "0";
        if (form.full_payment_amount) form.full_payment_amount.value = "0";
    }

    function loadIntoForms(golfDayBookingId, deps = {}) {
        const row = findRecord(deps.state, golfDayBookingId);
        const form = deps.document.getElementById("golf-day-form");
        const allocationForm = deps.document.getElementById("golf-day-allocation-form");
        if (!row) return;
        if (form instanceof global.HTMLFormElement) {
            form.golf_day_booking_id.value = String(row.id || "");
            form.event_name.value = String(row.event_name || "");
            form.contact_name.value = String(row.contact_name || "");
            form.event_date.value = String(row.event_date || "");
            form.event_end_date.value = String(row.event_end_date || "");
            form.invoice_reference.value = String(row.invoice_reference || "");
            form.account_customer_id.value = row.account_customer_id ? String(row.account_customer_id) : "";
            form.account_code.value = String(row.account_code || "");
            form.amount.value = String(row.amount ?? 0);
            form.balance_due.value = String(row.balance_due ?? 0);
            form.deposit_amount.value = String(row.deposit_amount ?? 0);
            form.full_payment_amount.value = String(row.full_payment_amount ?? 0);
            form.payment_status.value = String(row.payment_status || "pending");
            form.notes.value = String(row.notes || "");
            form.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        if (allocationForm instanceof global.HTMLFormElement) {
            allocationForm.golf_day_booking_id.value = String(row.id || "");
            allocationForm.group_name.value = String(row.event_name || "");
            allocationForm.date.value = String(row.event_date || deps.state.route.date || deps.todayYmd());
            allocationForm.account_code.value = String(row.account_code || "");
        }
    }

    function resetAllocationForm(form = global.document.getElementById("golf-day-allocation-form"), deps = {}) {
        if (!(form instanceof global.HTMLFormElement)) return;
        form.reset();
        if (form.golf_day_booking_id) form.golf_day_booking_id.value = "";
        if (form.date) form.date.value = deps.state?.route?.date || deps.todayYmd();
        if (form.start_time) form.start_time.value = "07:00";
        if (form.end_time) form.end_time.value = "11:00";
        if (form.tees) form.tees.value = "1,10";
        if (form.slots_per_time) form.slots_per_time.value = "4";
        if (form.price) form.price.value = "0";
    }

    async function submitForm(form, deps = {}) {
        const golfDayBookingId = deps.positiveInt(form.golf_day_booking_id?.value);
        const overrides = {
            event_name: String(form.event_name.value || "").trim(),
            contact_name: String(form.contact_name.value || "").trim() || null,
            event_date: String(form.event_date.value || "").trim() || null,
            event_end_date: String(form.event_end_date.value || "").trim() || null,
            invoice_reference: String(form.invoice_reference.value || "").trim() || null,
            account_customer_id: deps.positiveInt(form.account_customer_id?.value),
            account_code: String(form.account_code.value || "").trim() || null,
            amount: Number(form.amount.value || 0),
            balance_due: Number(form.balance_due.value || 0),
            deposit_amount: Number(form.deposit_amount.value || 0),
            full_payment_amount: Number(form.full_payment_amount.value || 0),
            payment_status: String(form.payment_status.value || "pending").trim(),
            notes: String(form.notes.value || "").trim() || null,
        };
        if (golfDayBookingId) {
            const current = findRecord(deps.state, golfDayBookingId);
            const payload = serializePayload(current, deps, overrides);
            await deps.postJson(`/api/admin/golf-day-bookings/${golfDayBookingId}`, payload, { method: "PUT" });
            deps.showToast("Golf day updated.", "ok");
        } else {
            await deps.postJson("/api/admin/golf-day-bookings", overrides);
            deps.showToast("Golf day created.", "ok");
        }
        invalidateCaches(deps);
        await deps.refreshActiveGolfWorkspace();
    }

    async function updateRecord(golfDayBookingId, overrides = {}, successMessage = "Golf day updated.", deps = {}) {
        const row = findRecord(deps.state, golfDayBookingId);
        if (!row) throw new Error("Golf day event not found.");
        const payload = serializePayload(row, deps, overrides);
        await deps.postJson(`/api/admin/golf-day-bookings/${Number(golfDayBookingId)}`, payload, { method: "PUT", invalidateCache: false });
        invalidateCaches(deps);
        deps.showToast(successMessage, "ok");
        await deps.refreshActiveGolfWorkspace();
    }

    async function markPaid(golfDayBookingId, deps = {}) {
        const row = findRecord(deps.state, golfDayBookingId);
        if (!row) throw new Error("Golf day event not found.");
        const amount = Math.max(0, deps.safeNumber(row.amount || 0));
        return updateRecord(golfDayBookingId, {
            full_payment_amount: amount,
            full_payment_date: deps.todayYmd(),
            balance_due: 0,
            payment_status: "paid",
        }, "Golf day settled as paid.", deps);
    }

    async function markCompleted(golfDayBookingId, deps = {}) {
        const row = findRecord(deps.state, golfDayBookingId);
        if (!row) throw new Error("Golf day event not found.");
        const status = lifecycle(row, deps);
        if (!["paid", "cancelled"].includes(String(row.payment_status || "").trim().toLowerCase()) && status.stage !== "Completed") {
            throw new Error("Settle the golf day before marking it complete.");
        }
        return updateRecord(golfDayBookingId, {
            operation_area: "completed",
        }, "Golf day marked complete.", deps);
    }

    async function submitAllocationForm(form, deps = {}) {
        const golfDayBookingId = deps.positiveInt(form.golf_day_booking_id?.value);
        const linked = golfDayBookingId ? findRecord(deps.state, golfDayBookingId) : null;
        const allocationDate = deps.clampYmd(form.date.value || linked?.event_date || deps.state.route?.date || deps.todayYmd());
        const payload = {
            date: allocationDate,
            tees: String(form.tees.value || "1,10").split(",").map(value => String(value || "").trim()).filter(Boolean),
            start_time: String(form.start_time.value || "07:00").trim(),
            end_time: String(form.end_time.value || "11:00").trim(),
            holes: Number(form.holes.value || 18) === 9 ? 9 : 18,
            slots_per_time: Number(form.slots_per_time.value || 4),
            group_name: String(form.group_name.value || linked?.event_name || "").trim(),
            event_type: "golf_day",
            account_code: String(form.account_code.value || linked?.account_code || "").trim() || null,
            account_customer_id: linked?.account_customer_id ? Number(linked.account_customer_id) : null,
            price: Number(form.price.value || 0),
        };
        const response = await deps.postJson("/api/admin/tee-sheet/bulk-book", payload, { invalidateCache: false });
        invalidateCaches(deps, allocationDate, { includeTeeRows: true });
        if (golfDayBookingId && linked) {
            await deps.postJson(`/api/admin/golf-day-bookings/${golfDayBookingId}`, serializePayload(linked, deps, {
                operation_area: "allocated",
            }), { method: "PUT", invalidateCache: false });
            deps.deleteSharedCacheKey(deps.golfDayBookingsCacheKey(deps.activeClubCacheKeyPart()));
        }
        deps.showToast(`Allocated ${deps.formatInteger(response?.created || 0)} tee-sheet booking(s).`, "ok");
        await deps.refreshActiveGolfWorkspace();
    }

    global.GreenLinkAdminGolfDayOps = {
        loadIntoForms,
        markCompleted,
        markPaid,
        renderPanel,
        resetAllocationForm,
        resetForm,
        submitAllocationForm,
        submitForm,
    };
})(window);
