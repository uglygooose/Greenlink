(function (global) {
    "use strict";

    function bundle(options = {}, deps = {}) {
        const signal = options.signal;
        const panel = options.panel || "profile";
        if (panel === "booking-window") {
            return deps.fetchJson("/api/admin/booking-window", { signal }).then(bookingWindow => ({ panel, bookingWindow }));
        }
        return deps.fetchJson("/api/admin/club-profile", { signal }).then(profile => ({ panel, profile }));
    }

    function renderBookingWindowWorkspace(bundle, deps = {}) {
        const bookingWindow = bundle.bookingWindow || {};
        return `
            ${deps.renderPageHero({
                title: "Booking Rules",
                copy: "Keep booking windows and cancellation guardrails readable without mixing them into daily operations.",
                workspace: "settings",
                subnavLabel: "Club setup pages",
                metrics: [
                    { label: "Member Days", value: deps.formatInteger(bookingWindow.member_days || 0), meta: "Advance member booking window" },
                    { label: "Affiliated Days", value: deps.formatInteger(bookingWindow.affiliated_days || 0), meta: "Affiliated visitor window" },
                    { label: "Non-affiliated Days", value: deps.formatInteger(bookingWindow.non_affiliated_days || 0), meta: "Non-affiliated visitor window" },
                    { label: "Group Cancel Days", value: deps.formatInteger(bookingWindow.group_cancel_days || 0), meta: "Group cancellation guardrail" },
                ],
            })}
            <section class="ops-utility-grid settings-shell">
                <div class="ops-utility-main">
                    <form class="form-card settings-form-card" id="booking-window-form">
                        <div class="panel-head">
                            <div>
                                <h3>Booking rules</h3>
                                <p>Club-side booking rules stay in a dedicated settings area, not mixed into daily operations.</p>
                            </div>
                        </div>
                        <div class="field-grid">
                            <div class="field"><label>Member Days</label><input name="member_days" type="number" min="0" max="365" value="${deps.escapeHtml(bookingWindow.member_days || 0)}"></div>
                            <div class="field"><label>Affiliated Visitor Days</label><input name="affiliated_days" type="number" min="0" max="365" value="${deps.escapeHtml(bookingWindow.affiliated_days || 0)}"></div>
                            <div class="field"><label>Non-affiliated Visitor Days</label><input name="non_affiliated_days" type="number" min="0" max="365" value="${deps.escapeHtml(bookingWindow.non_affiliated_days || 0)}"></div>
                            <div class="field"><label>Group Cancel Days</label><input name="group_cancel_days" type="number" min="0" max="365" value="${deps.escapeHtml(bookingWindow.group_cancel_days || 0)}"></div>
                        </div>
                        <div class="button-row">
                            <button type="submit" class="button">Save booking rules</button>
                        </div>
                    </form>
                </div>
                <aside class="ops-utility-rail">
                    <article class="card utility-note-card utility-summary-card">
                        <div class="panel-head">
                            <div>
                                <h4>Rules posture</h4>
                                <p>Keep guest access explicit and operationally safe.</p>
                            </div>
                        </div>
                        <div class="utility-stat-stack">
                            <div class="utility-stat-row">
                                <div>
                                    <div class="utility-stat-label">Earliest Access</div>
                                    <div class="utility-stat-value">${deps.escapeHtml(`${Math.min(...[bookingWindow.member_days || 0, bookingWindow.affiliated_days || 0, bookingWindow.non_affiliated_days || 0])}`)}</div>
                                    <div class="utility-stat-meta">Lowest active booking window in days</div>
                                </div>
                                ${deps.renderStatusPill("", (bookingWindow.group_cancel_days || 0) >= 7 ? "configured" : "missing")}
                            </div>
                            <div class="utility-stat-row">
                                <div>
                                    <div class="utility-stat-label">Group Cancel Guardrail</div>
                                    <div class="utility-stat-value">${deps.escapeHtml(`${bookingWindow.group_cancel_days || 0}`)}</div>
                                    <div class="utility-stat-meta">Days of notice required for group changes</div>
                                </div>
                            </div>
                        </div>
                    </article>
                    <article class="card utility-note-card">
                        <span class="utility-kicker">Settings Discipline</span>
                        <div class="utility-points">
                            <div class="utility-point">
                                <strong>Operational clarity</strong>
                                <span>Booking rules stay visible here so staff do not need to infer access policy from day-of-play screens.</span>
                            </div>
                            <div class="utility-point">
                                <strong>Fixed visual system</strong>
                                <span>Club setup remains identity and operations only. Theme or layout controls do not return on this page.</span>
                            </div>
                        </div>
                    </article>
                </aside>
            </section>
        `;
    }

    function renderProfileWorkspace(bundle, deps = {}) {
        const profile = bundle.profile || {};
        const enabledModules = Array.isArray(profile.enabled_modules) ? profile.enabled_modules : [];
        const sports = deps.sportsSetupConfig(profile || {});
        return `
            ${deps.renderPageHero({
                title: "Club Profile",
                copy: "Keep club setup lean: operational identity and booking policy only, without opening styling controls.",
                workspace: "settings",
                subnavLabel: "Club setup pages",
                metrics: [
                    { label: "Club Name", value: deps.escapeHtml(profile.display_name || profile.club_name || "Club"), meta: "Member-facing club identity" },
                    { label: "Location", value: deps.escapeHtml(profile.location || "-"), meta: "Current club location" },
                    { label: "Currency", value: deps.escapeHtml(profile.currency_symbol || "R"), meta: "Commercial display currency" },
                    { label: "Modules", value: deps.formatInteger(enabledModules.length), meta: "Enabled operational modules" },
                ],
            })}
            <section class="ops-utility-grid settings-shell">
                <div class="ops-utility-main">
                    ${deps.renderModuleValueGrid(enabledModules, { mode: "club" })}
                    <form class="form-card settings-form-card" id="club-profile-form">
                        <div class="panel-head">
                            <div>
                                <h3>Club profile</h3>
                                <p>Club-side settings are limited to practical branding and member-facing identity.</p>
                            </div>
                        </div>
                        <div class="field-grid">
                            <div class="field"><label>Club Name</label><input name="club_name" value="${deps.escapeHtml(profile.club_name || "")}"></div>
                            <div class="field"><label>Display Name</label><input name="display_name" value="${deps.escapeHtml(profile.display_name || "")}"></div>
                            <div class="field"><label>Tagline</label><input name="tagline" value="${deps.escapeHtml(profile.tagline || "")}"></div>
                            <div class="field"><label>Location</label><input name="location" value="${deps.escapeHtml(profile.location || "")}"></div>
                            <div class="field"><label>Website</label><input name="website" value="${deps.escapeHtml(profile.website || "")}"></div>
                            <div class="field"><label>Contact Email</label><input name="contact_email" type="email" value="${deps.escapeHtml(profile.contact_email || "")}"></div>
                            <div class="field"><label>Contact Phone</label><input name="contact_phone" value="${deps.escapeHtml(profile.contact_phone || "")}"></div>
                            <div class="field"><label>Currency Symbol</label><input name="currency_symbol" value="${deps.escapeHtml(profile.currency_symbol || "R")}" maxlength="4"></div>
                        </div>
                        ${(() => {
                            const enabled = new Set(enabledModules);
                            if (!enabled.has("tennis") && !enabled.has("padel") && !enabled.has("bowls")) {
                                return "";
                            }
                            return `
                                <div class="panel-head" style="margin-top:18px;">
                                    <div>
                                        <h3>Sports setup</h3>
                                        <p>Set the real number of tennis and padel courts, plus bowls rinks, so GreenLink can present honest capacity before member self-service booking goes live.</p>
                                    </div>
                                </div>
                                <div class="field-grid">
                                    ${enabled.has("tennis") ? `
                                        <div class="field"><label>Tennis Courts</label><input name="tennis_court_count" type="number" min="0" max="99" value="${deps.escapeHtml(sports.tennisCourtCount)}"></div>
                                        <div class="field"><label>Tennis Session Minutes</label><input name="tennis_session_minutes" type="number" min="15" max="360" step="15" value="${deps.escapeHtml(sports.tennisSessionMinutes)}"></div>
                                        <div class="field"><label>Tennis Open</label><input name="tennis_open_time" type="time" value="${deps.escapeHtml(sports.tennisOpenTime)}"></div>
                                        <div class="field"><label>Tennis Close</label><input name="tennis_close_time" type="time" value="${deps.escapeHtml(sports.tennisCloseTime)}"></div>
                                        <div class="field" style="grid-column: 1 / -1;"><label>Tennis Court Names</label><textarea name="tennis_court_names" placeholder="Court 1&#10;Court 2">${deps.escapeHtml(sports.tennisCourtNames.join("\n"))}</textarea></div>
                                    ` : ``}
                                    ${enabled.has("padel") ? `
                                        <div class="field"><label>Padel Courts</label><input name="padel_court_count" type="number" min="0" max="99" value="${deps.escapeHtml(sports.padelCourtCount)}"></div>
                                        <div class="field"><label>Padel Session Minutes</label><input name="padel_session_minutes" type="number" min="15" max="360" step="15" value="${deps.escapeHtml(sports.padelSessionMinutes)}"></div>
                                        <div class="field"><label>Padel Open</label><input name="padel_open_time" type="time" value="${deps.escapeHtml(sports.padelOpenTime)}"></div>
                                        <div class="field"><label>Padel Close</label><input name="padel_close_time" type="time" value="${deps.escapeHtml(sports.padelCloseTime)}"></div>
                                        <div class="field" style="grid-column: 1 / -1;"><label>Padel Court Names</label><textarea name="padel_court_names" placeholder="Court 1&#10;Court 2">${deps.escapeHtml(sports.padelCourtNames.join("\n"))}</textarea></div>
                                    ` : ``}
                                    ${enabled.has("bowls") ? `
                                        <div class="field"><label>Bowls Rinks</label><input name="bowls_rink_count" type="number" min="0" max="99" value="${deps.escapeHtml(sports.bowlsRinkCount)}"></div>
                                        <div class="field"><label>Bowls Session Minutes</label><input name="bowls_session_minutes" type="number" min="30" max="480" step="30" value="${deps.escapeHtml(sports.bowlsSessionMinutes)}"></div>
                                        <div class="field"><label>Bowls Open</label><input name="bowls_open_time" type="time" value="${deps.escapeHtml(sports.bowlsOpenTime)}"></div>
                                        <div class="field"><label>Bowls Close</label><input name="bowls_close_time" type="time" value="${deps.escapeHtml(sports.bowlsCloseTime)}"></div>
                                        <div class="field" style="grid-column: 1 / -1;"><label>Bowls Rink Names</label><textarea name="bowls_rink_names" placeholder="Rink 1&#10;Rink 2">${deps.escapeHtml(sports.bowlsRinkNames.join("\n"))}</textarea></div>
                                    ` : ``}
                                </div>
                            `;
                        })()}
                        <div class="button-row">
                            <button type="submit" class="button">Save club profile</button>
                        </div>
                    </form>
                </div>
                <aside class="ops-utility-rail">
                    <article class="card utility-note-card utility-summary-card">
                        <div class="panel-head">
                            <div>
                                <h4>Identity posture</h4>
                                <p>GreenLink keeps profile setup practical and fixed-system.</p>
                            </div>
                        </div>
                        <div class="utility-stat-stack">
                            <div class="utility-stat-row">
                                <div>
                                    <div class="utility-stat-label">Display Identity</div>
                                    <div class="utility-stat-value">${deps.escapeHtml(profile.display_name || profile.club_name || "Club")}</div>
                                    <div class="utility-stat-meta">Member-facing club label in the current shell</div>
                                </div>
                            </div>
                            <div class="utility-stat-row">
                                <div>
                                    <div class="utility-stat-label">Enabled Modules</div>
                                    <div class="utility-stat-value">${deps.formatInteger(enabledModules.length)}</div>
                                    <div class="utility-stat-meta">Operational modules currently exposed for this club</div>
                                </div>
                            </div>
                        </div>
                    </article>
                    <article class="card utility-note-card">
                        <span class="utility-kicker">Brand Guardrail</span>
                        <div class="utility-points">
                            <div class="utility-point">
                                <strong>Fixed visual system</strong>
                                <span>No per-club color, layout, or theme controls are reintroduced here. Club setup stays operational.</span>
                            </div>
                            <div class="utility-point">
                                <strong>Capacity honesty</strong>
                                <span>Sports counts and session timings should reflect the real floor so member booking posture stays trustworthy.</span>
                            </div>
                        </div>
                    </article>
                </aside>
            </section>
        `;
    }

    function renderWorkspace(bundle, deps = {}) {
        if ((bundle?.panel || "profile") === "booking-window") {
            return renderBookingWindowWorkspace(bundle, deps);
        }
        return renderProfileWorkspace(bundle, deps);
    }

    async function submitBookingWindowForm(form, deps = {}) {
        const payload = {
            member_days: Number(form.member_days.value || 0),
            affiliated_days: Number(form.affiliated_days.value || 0),
            non_affiliated_days: Number(form.non_affiliated_days.value || 0),
            group_cancel_days: Number(form.group_cancel_days.value || 0),
        };
        await deps.postJson("/api/admin/booking-window", payload, { method: "PUT" });
        deps.showToast("Booking rules saved.", "ok");
        await deps.refreshActiveSettingsWorkspace();
    }

    async function submitClubProfileForm(form, deps = {}) {
        const parseLines = value => String(value || "").split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
        const payload = {
            club_name: String(form.club_name.value || "").trim(),
            display_name: String(form.display_name.value || "").trim() || null,
            tagline: String(form.tagline.value || "").trim() || null,
            location: String(form.location.value || "").trim() || null,
            website: String(form.website.value || "").trim() || null,
            contact_email: String(form.contact_email.value || "").trim() || null,
            contact_phone: String(form.contact_phone.value || "").trim() || null,
            currency_symbol: String(form.currency_symbol.value || "").trim() || null,
            tennis_court_count: form.tennis_court_count ? Number(form.tennis_court_count.value || 0) : null,
            tennis_session_minutes: form.tennis_session_minutes ? Number(form.tennis_session_minutes.value || 60) : null,
            tennis_open_time: form.tennis_open_time ? String(form.tennis_open_time.value || "").trim() || null : null,
            tennis_close_time: form.tennis_close_time ? String(form.tennis_close_time.value || "").trim() || null : null,
            tennis_court_names: form.tennis_court_names ? parseLines(form.tennis_court_names.value) : null,
            padel_court_count: form.padel_court_count ? Number(form.padel_court_count.value || 0) : null,
            padel_session_minutes: form.padel_session_minutes ? Number(form.padel_session_minutes.value || 60) : null,
            padel_open_time: form.padel_open_time ? String(form.padel_open_time.value || "").trim() || null : null,
            padel_close_time: form.padel_close_time ? String(form.padel_close_time.value || "").trim() || null : null,
            padel_court_names: form.padel_court_names ? parseLines(form.padel_court_names.value) : null,
            bowls_rink_count: form.bowls_rink_count ? Number(form.bowls_rink_count.value || 0) : null,
            bowls_session_minutes: form.bowls_session_minutes ? Number(form.bowls_session_minutes.value || 120) : null,
            bowls_open_time: form.bowls_open_time ? String(form.bowls_open_time.value || "").trim() || null : null,
            bowls_close_time: form.bowls_close_time ? String(form.bowls_close_time.value || "").trim() || null : null,
            bowls_rink_names: form.bowls_rink_names ? parseLines(form.bowls_rink_names.value) : null,
        };
        await deps.postJson("/api/admin/club-profile", payload, { method: "PUT" });
        deps.showToast("Club profile saved.", "ok");
        await deps.refreshBootstrap(true);
        await deps.refreshActiveSettingsWorkspace();
    }

    global.GreenLinkAdminClubSettings = {
        bundle,
        renderWorkspace,
        submitBookingWindowForm,
        submitClubProfileForm,
    };
})(window);
