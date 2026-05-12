// surfaces.jsx — Brand + Admin + Onboarding artboards.
// Six surfaces at 1440×900, demonstrating the system in use.

/* ============================================================
   06 · Login — Brand surface, full Traditional discipline.
   ============================================================ */
const LoginAB = () => (
  <div className="gl" style={{ width: "100%", height: "100%", display: "flex", overflow: "hidden" }}>
    {/* Photography side — one beautifully framed moment */}
    <div style={{ width: "58%", position: "relative", background: "var(--gl-heritage-900)" }}>
      <HeroPlaceholder tone="dawn" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(20,33,31,0.0) 40%, rgba(20,33,31,0.55) 100%)",
      }} />
      <div style={{ position: "absolute", top: 40, left: 48, color: "var(--gl-parchment)" }}>
        <Wordmark size={24} color="var(--gl-parchment)" />
      </div>
      <div style={{ position: "absolute", bottom: 48, left: 48, right: 48, color: "var(--gl-parchment)" }}>
        <div className="gl-serif" style={{ fontSize: 56, lineHeight: 1.05, fontWeight: 400, letterSpacing: "-0.02em", maxWidth: 560 }}>
          The course<br/>before anyone’s on it.
        </div>
        <div style={{ marginTop: 16, fontSize: 13, opacity: 0.78, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Hole 13 · Umhlali Country Club · 06:14
        </div>
      </div>
    </div>
    {/* Form side */}
    <div style={{ flex: 1, background: "var(--gl-surface)", padding: "56px 64px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div className="gl-eyebrow">Welcome back</div>

      <div style={{ maxWidth: 420 }}>
        <h1 className="gl-serif" style={{ margin: 0, fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.02em", fontWeight: 500 }}>
          Sign in
        </h1>
        <p className="gl-muted" style={{ marginTop: 12, marginBottom: 28, fontSize: 14, lineHeight: 1.55 }}>
          Operations for clubs that hold the tradition of the institution and the energy of the modern game.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label className="gl-label">Email</label>
            <input className="gl-input" defaultValue="captain@umhlali.golf" />
          </div>
          <div>
            <label className="gl-label" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Password</span>
              <a href="#" style={{ color: "var(--gl-brand)", textTransform: "none", letterSpacing: 0, fontSize: 11 }}>Forgot it?</a>
            </label>
            <div style={{ position: "relative" }}>
              <input className="gl-input" type="password" defaultValue="••••••••••" />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--gl-text-secondary)" }}>
                <Icon name="visibility" size={16} />
              </span>
            </div>
          </div>

          <button className="gl-btn gl-btn--primary" data-size="lg" style={{ width: "100%", marginTop: 8 }}>
            Sign in
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
            <span className="gl-divider" style={{ flex: 1 }} />
            <span className="gl-t-xs gl-muted">or</span>
            <span className="gl-divider" style={{ flex: 1 }} />
          </div>

          <button className="gl-btn gl-btn--secondary" data-size="lg" style={{ width: "100%" }}>
            <Icon name="key" size={16} /> Sign in with passkey
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--gl-text-secondary)", fontSize: 12 }}>
        <span>© 2026 GreenLink · Built in South Africa</span>
        <div style={{ display: "flex", gap: 16 }}>
          <a href="#" style={{ color: "inherit" }}>POPIA</a>
          <a href="#" style={{ color: "inherit" }}>Support</a>
          <a href="#" style={{ color: "inherit" }}>Status</a>
        </div>
      </div>
    </div>
  </div>
);

/* ============================================================
   07 · Admin Dashboard — Working surface, default density.
   ============================================================ */
const AdminShellAB = ({ density = "default" }) => (
  <div className="gl" data-density={density} style={{ width: "100%", height: "100%", display: "flex", overflow: "hidden" }}>
    <AdminSidebar />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--gl-surface)" }}>
      <AdminTopBar title="Dashboard" />
      <div style={{ padding: 28, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24, overflow: "auto" }}>

        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Today strip */}
          <div className="gl-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "18px 22px 12px 22px", borderBottom: "1px solid var(--gl-border-subtle)" }}>
              <div>
                <div className="gl-eyebrow">Saturday · 12 May 2026</div>
                <div className="gl-serif" style={{ fontSize: 22, fontWeight: 500, marginTop: 6, letterSpacing: "-0.01em" }}>The course, today</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="gl-btn gl-btn--secondary" data-size="sm"><Icon name="today" size={14} />Today</button>
                <button className="gl-btn gl-btn--secondary" data-size="sm"><Icon name="chevron_left" size={14} /></button>
                <button className="gl-btn gl-btn--secondary" data-size="sm"><Icon name="chevron_right" size={14} /></button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
              <Stat label="Slots booked"   value="92 / 104" sub="3 at-risk"     accent="var(--gl-state-atrisk)" />
              <Stat label="Members on course" value="174" sub="↑ 6% on Sat avg" accent="var(--gl-state-checkedin)" border />
              <Stat label="Gross takings · live" value="R 41 482" sub="of R 58k forecast"  border />
              <Stat label="Unmatched lines" value="2" sub="needs GL code" accent="var(--gl-caddie)" border />
            </div>
          </div>

          {/* Today's flights */}
          <div className="gl-card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 22px", borderBottom: "1px solid var(--gl-border-subtle)" }}>
              <div className="gl-serif" style={{ fontSize: 18, fontWeight: 500 }}>Next on the tee</div>
              <a href="#" className="gl-btn gl-btn--tertiary" data-size="sm">Open tee sheet <Icon name="arrow_forward" size={14} /></a>
            </div>
            <table className="gl-table">
              <thead>
                <tr>
                  <th>Time</th><th>Course</th><th>Members</th><th>Cart</th><th>State</th><th></th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["07:18", "The Bluff",   "Dlamini · Botha · Naidoo · van Wyk", "2", "checkedin"],
                  ["07:26", "The Bluff",   "Reddy · de Beer · +2",               "1", "checkedin"],
                  ["07:34", "The Bluff",   "Marais · Singh · — · —",             "0", "atrisk"],
                  ["07:42", "The Bluff",   "Khumalo · Pillay · O’Hara · Smit",   "2", "booked"],
                  ["07:50", "The Bluff",   "—",                                   "—", "open"],
                  ["07:58", "The Bluff",   "Greenkeeper · aeration block",       "—", "blocked"],
                ].map(([t, c, m, cart, st], i) => (
                  <tr key={i}>
                    <td className="gl-mono" style={{ width: 70 }}>{t}</td>
                    <td style={{ width: 110, color: "var(--gl-text-secondary)" }}>{c}</td>
                    <td>{m}</td>
                    <td className="gl-tabular" style={{ width: 56 }}>{cart}</td>
                    <td style={{ width: 130 }}><TeeState state={st} /></td>
                    <td style={{ width: 36, textAlign: "right" }}><Icon name="more_horiz" size={16} color="var(--gl-text-secondary)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="gl-card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div className="gl-serif" style={{ fontSize: 18, fontWeight: 500 }}>Daily close</div>
              <span className="gl-badge" style={{ color: "var(--gl-state-atrisk)" }}><span className="dot" />Pending</span>
            </div>
            <div className="gl-muted gl-t-sm" style={{ marginBottom: 14 }}>Runs at 23:30 · Sage Pastel Partner profile bound</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <CloseRow label="Pro shop till" status="Matched" amount="R 22 882.50" ok />
              <CloseRow label="Halfway house"  status="Matched" amount="R  6 410.00" ok />
              <CloseRow label="Bar · main"     status="Variance R 12.50" amount="R 12 190.00" warn />
              <CloseRow label="Membership debits" status="1 NSF · K. Naidoo" amount="R  1 850.00" err />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--gl-border-subtle)" }}>
              <span className="gl-t-xs gl-muted">All tills reconcile to Sage</span>
              <button className="gl-btn gl-btn--primary" data-size="sm">Review & close</button>
            </div>
          </div>

          <div className="gl-card">
            <div className="gl-serif" style={{ fontSize: 18, fontWeight: 500, marginBottom: 10 }}>Activity</div>
            <ActivityRow icon="event_available" text={<><b>T. Botha</b> booked 07:26 for Sun · 13 May</>} t="2 min" />
            <ActivityRow icon="how_to_reg"      text={<><b>Marshal · D. Singh</b> checked in flight 07:18</>} t="6 min" />
            <ActivityRow icon="payments"        text={<><b>POS · Bar</b> closed shift · R 12 190</>} t="12 min" />
            <ActivityRow icon="warning_amber"   text={<><b>Audit</b> flagged 2 unmatched lines for review</>} t="38 min" color="var(--gl-state-atrisk)" />
            <ActivityRow icon="trending_up"     text={<><b>K. Singh</b> posted score 84 · ↓ 0.3 handicap</>} t="1 hr" />
          </div>

          <div className="gl-card gl-card--sunken">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div className="gl-t-xs gl-muted">SA accounting · synced</div>
                <div className="gl-serif" style={{ fontSize: 16, marginTop: 4, fontWeight: 500 }}>Sage Pastel Partner</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gl-state-checkedin)" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--gl-state-checkedin)" }} />
                Up to date · 14:02
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
);

const AdminSidebar = () => (
  <aside style={{
    width: 224, background: "var(--gl-surface-2)", borderRight: "1px solid var(--gl-border-subtle)",
    padding: "20px 12px", display: "flex", flexDirection: "column", gap: 4,
  }}>
    <div style={{ padding: "8px 10px 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Wordmark size={20} color="var(--gl-text-primary)" />
      <Icon name="unfold_more" size={16} color="var(--gl-text-secondary)" />
    </div>

    <NavGroup title="Operate">
      <NavItem icon="dashboard" label="Dashboard" active />
      <NavItem icon="calendar_month" label="Tee sheet" badge="92" />
      <NavItem icon="point_of_sale" label="Point of sale" />
      <NavItem icon="event_available" label="Bookings" />
      <NavItem icon="groups" label="Members" />
    </NavGroup>

    <NavGroup title="Finance">
      <NavItem icon="receipt_long" label="Daily close" badge="2" badgeKind="warn" />
      <NavItem icon="account_balance" label="Member ledger" />
      <NavItem icon="sync_alt" label="Accounting" />
      <NavItem icon="rule" label="Audit log" />
    </NavGroup>

    <NavGroup title="Club">
      <NavItem icon="golf_course" label="Courses & pricing" />
      <NavItem icon="trending_up" label="Handicaps" />
      <NavItem icon="emoji_events" label="Competitions" />
      <NavItem icon="forum" label="Communications" />
      <NavItem icon="insights" label="Reports" />
    </NavGroup>

    <div style={{ marginTop: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <NavItem icon="settings" label="Settings" />
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 8px", borderRadius: 6,
        background: "var(--gl-surface-raised)", border: "1px solid var(--gl-border-subtle)",
      }}>
        <Avatar initials="EM" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>E. Mngomezulu</div>
          <div style={{ fontSize: 10.5, color: "var(--gl-text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>GM · Umhlali CC</div>
        </div>
        <Icon name="more_vert" size={14} color="var(--gl-text-secondary)" />
      </div>
    </div>
  </aside>
);

const NavGroup = ({ title, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
    <div style={{
      padding: "8px 10px 4px 10px",
      fontSize: 10, color: "var(--gl-text-secondary)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500,
    }}>{title}</div>
    {children}
  </div>
);

const NavItem = ({ icon, label, active, badge, badgeKind = "default" }) => (
  <a href="#" style={{
    display: "flex", alignItems: "center", gap: 10,
    padding: "7px 10px", borderRadius: 5,
    color: active ? "var(--gl-text-primary)" : "var(--gl-text-secondary)",
    background: active ? "var(--gl-surface-raised)" : "transparent",
    fontSize: 13, fontWeight: active ? 500 : 400,
    textDecoration: "none",
    borderLeft: active ? "2px solid var(--gl-brand)" : "2px solid transparent",
    position: "relative",
  }}>
    <Icon name={icon} size={16} color={active ? "var(--gl-brand)" : "var(--gl-text-secondary)"} />
    <span style={{ flex: 1 }}>{label}</span>
    {badge && (
      <span style={{
        fontSize: 10, padding: "1px 6px", borderRadius: 999, fontWeight: 500,
        background: badgeKind === "warn" ? "var(--gl-caddie)" : "var(--gl-fog)",
        color: badgeKind === "warn" ? "var(--gl-parchment)" : "var(--gl-text-secondary)",
        fontVariantNumeric: "tabular-nums",
      }}>{badge}</span>
    )}
  </a>
);

const AdminTopBar = ({ title, breadcrumbs }) => (
  <header style={{
    height: 64, borderBottom: "1px solid var(--gl-border-subtle)",
    display: "flex", alignItems: "center", padding: "0 28px", gap: 20, background: "var(--gl-surface)",
  }}>
    <div style={{ display: "flex", flexDirection: "column" }}>
      {breadcrumbs ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--gl-text-secondary)", letterSpacing: "0.04em" }}>
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Icon name="chevron_right" size={12} color="var(--gl-text-secondary)" />}
              <span>{b}</span>
            </React.Fragment>
          ))}
        </div>
      ) : null}
      <div className="gl-serif" style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", marginTop: breadcrumbs ? 2 : 0 }}>{title}</div>
    </div>

    <div style={{ flex: 1, maxWidth: 420, marginLeft: 24 }}>
      <div className="gl-input" style={{ paddingLeft: 12, height: 36 }}>
        <Icon name="search" size={16} color="var(--gl-text-secondary)" />
        <input style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "inherit", font: "inherit", fontSize: 13 }} placeholder="Search members, GL codes, dates…" />
        <span className="gl-kbd">⌘K</span>
      </div>
    </div>

    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
      <button className="gl-btn gl-btn--secondary" data-size="sm"><Icon name="add" size={14} />New booking</button>
      <button className="gl-btn gl-btn--secondary" data-size="sm" style={{ padding: "0 10px" }}><Icon name="notifications" size={16} /></button>
      <button className="gl-btn gl-btn--secondary" data-size="sm" style={{ padding: "0 10px" }}><Icon name="help_outline" size={16} /></button>
    </div>
  </header>
);

const Stat = ({ label, value, sub, accent, border }) => (
  <div style={{ padding: "16px 22px", borderLeft: border ? "1px solid var(--gl-border-subtle)" : "none" }}>
    <div className="gl-t-xs gl-muted">{label}</div>
    <div className="gl-serif gl-tabular" style={{ fontSize: 28, fontWeight: 500, marginTop: 6, letterSpacing: "-0.01em" }}>{value}</div>
    {sub && <div style={{ fontSize: 11.5, marginTop: 4, color: accent || "var(--gl-text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>{sub}</div>}
  </div>
);

const TeeState = ({ state }) => {
  const map = {
    open:       { c: "var(--gl-state-open)",      fg: "var(--gl-text-secondary)", icon: "schedule",         label: "Open" },
    booked:     { c: "var(--gl-state-booked)",    fg: "var(--gl-parchment)",      icon: "event_available",  label: "Booked" },
    checkedin:  { c: "var(--gl-state-checkedin)", fg: "var(--gl-parchment)",      icon: "how_to_reg",       label: "Checked in" },
    atrisk:     { c: "var(--gl-state-atrisk)",    fg: "var(--gl-charcoal)",       icon: "warning_amber",    label: "At-risk" },
    noshow:     { c: "var(--gl-state-noshow)",    fg: "var(--gl-parchment)",      icon: "cancel",           label: "No-show" },
    blocked:    { c: "var(--gl-state-blocked)",   fg: "var(--gl-parchment)",      icon: "block",            label: "Blocked" },
  }[state];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 9px", borderRadius: 4,
      background: map.c, color: map.fg,
      fontSize: 11, fontWeight: 500, letterSpacing: "0.02em",
      border: state === "open" ? "1px solid var(--gl-border)" : "none",
    }}>
      <Icon name={map.icon} size={12} color={map.fg} /> {map.label}
    </span>
  );
};

const CloseRow = ({ label, status, amount, ok, warn, err }) => {
  const c = err ? "var(--gl-caddie)" : warn ? "var(--gl-state-atrisk)" : "var(--gl-state-checkedin)";
  const ic = err ? "error" : warn ? "warning_amber" : "check_circle";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
      <Icon name={ic} size={16} color={c} />
      <span style={{ flex: 1 }}>{label}</span>
      <span className="gl-muted" style={{ fontSize: 11.5 }}>{status}</span>
      <span className="gl-tabular" style={{ minWidth: 90, textAlign: "right" }}>{amount}</span>
    </div>
  );
};

const ActivityRow = ({ icon, text, t, color }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--gl-border-subtle)" }}>
    <Icon name={icon} size={16} color={color || "var(--gl-text-secondary)"} />
    <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5 }}>{text}</div>
    <div className="gl-muted" style={{ fontSize: 11 }}>{t}</div>
  </div>
);

const Avatar = ({ initials, size = 28 }) => (
  <span style={{
    width: size, height: size, borderRadius: 999,
    background: "var(--gl-heritage-700)", color: "var(--gl-parchment)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: size * 0.42, fontWeight: 500, fontFamily: "var(--gl-font-serif)",
    flexShrink: 0,
  }}>{initials}</span>
);

/* ============================================================
   08 · Settings hub — Working surface, sectioned + navigable.
   ============================================================ */
const SettingsAB = () => (
  <div className="gl" style={{ width: "100%", height: "100%", display: "flex", overflow: "hidden" }}>
    <AdminSidebar />
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--gl-surface)" }}>
      <AdminTopBar title="Club" breadcrumbs={["Settings"]} />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Settings sub-nav */}
        <nav style={{ width: 200, padding: "20px 8px 20px 20px", borderRight: "1px solid var(--gl-border-subtle)" }}>
          <div className="gl-t-xs gl-muted" style={{ padding: "4px 10px 10px 10px" }}>Account</div>
          <SubNav label="Profile" />
          <SubNav label="Security" />
          <SubNav label="Notifications" />
          <div className="gl-t-xs gl-muted" style={{ padding: "16px 10px 10px 10px" }}>Club</div>
          <SubNav label="Club details" active />
          <SubNav label="Accounting" />
          <SubNav label="Info Officer" />
          <SubNav label="Integrations" />
          <div className="gl-t-xs gl-muted" style={{ padding: "16px 10px 10px 10px" }}>Members</div>
          <SubNav label="Membership types" />
          <SubNav label="Households" />
          <SubNav label="Billing rules" />
          <div className="gl-t-xs gl-muted" style={{ padding: "16px 10px 10px 10px" }}>System</div>
          <SubNav label="Communications" />
          <SubNav label="Accessibility" />
        </nav>

        <div style={{ flex: 1, padding: "28px 36px", overflow: "auto" }}>
          <div style={{ maxWidth: 720 }}>
            <h2 className="gl-serif" style={{ margin: 0, fontSize: 28, fontWeight: 500, letterSpacing: "-0.015em" }}>Club details</h2>
            <p className="gl-muted" style={{ marginTop: 6, marginBottom: 28, fontSize: 13.5, lineHeight: 1.55 }}>
              The configuration members and staff see across every surface. Changes propagate within a minute.
            </p>

            <SettingsSection title="Identity">
              <Field label="Club name" defaultValue="Umhlali Country Club" />
              <Field label="Founded" defaultValue="1934" tabular />
              <Field label="Region / Province" defaultValue="KwaZulu-Natal, ZA" />
              <Field label="Public website" defaultValue="https://umhlali.golf" />
            </SettingsSection>

            <SettingsSection title="Accounting binding" pill={{ kind: "ok", text: "Connected" }}>
              <RadioCard
                title="Sage Pastel Partner"
                desc="Active profile. Daily close exports to GL accounts on the mapped schedule."
                meta="Last sync · 14:02 · 0 errors"
                selected
              />
              <RadioCard title="Sage 200 Evolution" desc="Available — switch with finance lead approval." />
              <RadioCard title="Xero ZA" desc="Available — switch with finance lead approval." />
            </SettingsSection>

            <SettingsSection title="Course & tee sheet defaults">
              <Field label="Default slot interval" defaultValue="8 minutes" tabular />
              <Field label="Booking lead-time" defaultValue="14 days" tabular />
              <Field label="Cancellation window" defaultValue="6 hours" tabular />
            </SettingsSection>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--gl-border-subtle)" }}>
              <button className="gl-btn gl-btn--secondary">Discard</button>
              <button className="gl-btn gl-btn--primary">Save changes</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const SubNav = ({ label, active }) => (
  <a href="#" style={{
    display: "block", padding: "7px 10px", borderRadius: 5,
    fontSize: 13, fontWeight: active ? 500 : 400,
    color: active ? "var(--gl-text-primary)" : "var(--gl-text-secondary)",
    background: active ? "var(--gl-surface-2)" : "transparent",
    textDecoration: "none",
    borderLeft: active ? "2px solid var(--gl-brand)" : "2px solid transparent",
  }}>{label}</a>
);

const SettingsSection = ({ title, pill, children }) => (
  <section style={{ marginBottom: 32 }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 12, borderBottom: "1px solid var(--gl-border-subtle)", marginBottom: 18 }}>
      <h3 className="gl-serif" style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: "-0.005em" }}>{title}</h3>
      {pill && <StatusPill kind={pill.kind === "ok" ? "ok" : "warn"}>{pill.text}</StatusPill>}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
  </section>
);

const Field = ({ label, defaultValue, tabular }) => (
  <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 18, alignItems: "center" }}>
    <label className="gl-label" style={{ margin: 0 }}>{label}</label>
    <input className={"gl-input" + (tabular ? " gl-tabular" : "")} defaultValue={defaultValue} />
  </div>
);

const RadioCard = ({ title, desc, meta, selected }) => (
  <div style={{
    display: "flex", gap: 14, padding: 16,
    border: "1px solid " + (selected ? "var(--gl-brand)" : "var(--gl-border-subtle)"),
    borderRadius: 6, background: selected ? "var(--gl-brand-soft)" : "var(--gl-surface-raised)",
    transition: "border-color 180ms",
  }}>
    <span style={{
      width: 18, height: 18, borderRadius: 999, marginTop: 2, flexShrink: 0,
      border: "1.5px solid " + (selected ? "var(--gl-brand)" : "var(--gl-border-strong)"),
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      {selected && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--gl-brand)" }} />}
    </span>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
      <div className="gl-muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
      {meta && <div className="gl-mono" style={{ fontSize: 11, color: "var(--gl-text-secondary)", marginTop: 8 }}>{meta}</div>}
    </div>
  </div>
);

/* ============================================================
   09 · Onboarding · Welcome — Brand surface.
   ============================================================ */
const OnboardingWelcomeAB = () => (
  <div className="gl" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--gl-surface)" }}>
    <header style={{ padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--gl-border-subtle)" }}>
      <Wordmark size={20} color="var(--gl-text-primary)" />
      <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 12, color: "var(--gl-text-secondary)" }}>
        <OnboardingProgress step={1} of={6} />
        <a href="#" style={{ color: "inherit" }}>Save & exit</a>
      </div>
    </header>

    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", overflow: "hidden" }}>
      <div style={{ padding: "72px 64px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}>
        <div className="gl-eyebrow">Welcome to GreenLink</div>
        <h1 className="gl-serif" style={{ margin: 0, fontSize: 64, lineHeight: 1.02, fontWeight: 500, letterSpacing: "-0.025em" }}>
          Let’s set up <em style={{ fontWeight: 500 }}>your club</em>.
        </h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: "var(--gl-text-secondary)", maxWidth: 480 }}>
          Six short steps. The tee sheet, the till, the ledger, the handicap data, and the people — bound to the accounting platform you already use.
        </p>

        <div className="gl-card" style={{ marginTop: 16, padding: 20, maxWidth: 520 }}>
          <div className="gl-t-xs gl-muted">What you’ll need on hand</div>
          <ul style={{ marginTop: 10, marginBottom: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5, lineHeight: 1.5 }}>
            <li>Your club’s registered details and Information Officer.</li>
            <li>Accounting profile credentials (Pastel Partner, Sage 200, or Xero ZA).</li>
            <li>An existing member CSV — we’ll handle households on import.</li>
          </ul>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="gl-btn gl-btn--primary" data-size="lg">Begin setup <Icon name="arrow_forward" size={16} /></button>
          <button className="gl-btn gl-btn--tertiary">I have a partner code</button>
        </div>
      </div>

      <div style={{ position: "relative", background: "var(--gl-heritage-900)" }}>
        <HeroPlaceholder tone="mist" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(90deg, rgba(20,33,31,0.0) 60%, rgba(20,33,31,0.4) 100%)",
        }} />
        <div style={{ position: "absolute", bottom: 32, left: 32, color: "var(--gl-parchment)", fontSize: 12, opacity: 0.85, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Hole 4 · early mist · 06:38
        </div>
      </div>
    </div>
  </div>
);

const OnboardingProgress = ({ step, of }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <div style={{ display: "flex", gap: 4 }}>
      {Array.from({ length: of }).map((_, i) => (
        <span key={i} style={{
          width: 20, height: 3, borderRadius: 2,
          background: i < step ? "var(--gl-heritage-500)" : "var(--gl-stone)",
          transition: "background 180ms",
        }} />
      ))}
    </div>
    <span className="gl-mono" style={{ fontSize: 11 }}>Step {step} of {of}</span>
  </div>
);

/* ============================================================
   10 · Onboarding · POPIA moment — first-class consent.
   ============================================================ */
const OnboardingPopiaAB = () => (
  <div className="gl" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--gl-surface)" }}>
    <header style={{ padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--gl-border-subtle)" }}>
      <Wordmark size={20} color="var(--gl-text-primary)" />
      <OnboardingProgress step={3} of={6} />
      <a href="#" style={{ fontSize: 12, color: "var(--gl-text-secondary)" }}>Save & exit</a>
    </header>

    <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "48px 24px 32px 24px", overflow: "auto" }}>
      <div style={{ maxWidth: 760, width: "100%" }}>
        <div className="gl-eyebrow" style={{ marginBottom: 16 }}>03 · POPIA · The lawful basis</div>
        <h1 className="gl-serif" style={{ margin: 0, fontSize: 44, lineHeight: 1.08, fontWeight: 500, letterSpacing: "-0.018em" }}>
          How your members’ data is held.
        </h1>
        <p style={{ marginTop: 14, fontSize: 15, color: "var(--gl-text-secondary)", lineHeight: 1.6, maxWidth: 620 }}>
          South Africa’s Protection of Personal Information Act sets the rules. We treat this as a first-class moment, not a checkbox at the end of a form.
        </p>

        <div className="gl-card" style={{ marginTop: 28, padding: 0, overflow: "hidden" }}>
          <PopiaRow icon="security"          title="GreenLink is the operator"
            body="The club is the responsible party. GreenLink processes personal information on your written instruction only, under Section 21 of POPIA." />
          <PopiaRow icon="lock"              title="Where data lives"
            body="Stored in az-jhb-1 (Johannesburg). Encrypted at rest and in transit. Backups in az-cpt-1. Never replicated outside the Republic." />
          <PopiaRow icon="visibility_lock"   title="Who can read what"
            body="Staff roles see exactly what their role requires — pro shop sees tee bookings, finance sees the ledger, marshals see today’s sheet only." />
          <PopiaRow icon="schedule"          title="Retention"
            body="Member personal data held for the duration of membership plus seven years (SARS). You can shorten this in Settings → Club → Retention." />
          <PopiaRow last icon="how_to_reg"   title="Subject access requests"
            body="Members can export or delete their own data from the member portal. Requests under Section 23 are logged and audited." />
        </div>

        <div style={{ marginTop: 28, padding: 20, background: "var(--gl-brand-soft)", borderRadius: 6, border: "1px solid color-mix(in oklab, var(--gl-brand) 25%, var(--gl-border-subtle))" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <Icon name="gavel" size={22} color="var(--gl-brand)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Designate your Information Officer</div>
              <div className="gl-muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
                POPIA requires every club to register one. The General Manager is the default. You can change this in the next step.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                <Avatar initials="EM" size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>E. Mngomezulu</div>
                  <div className="gl-muted" style={{ fontSize: 11.5 }}>General Manager · captain@umhlali.golf</div>
                </div>
                <button className="gl-btn gl-btn--tertiary" data-size="sm">Change</button>
              </div>
            </div>
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 24, fontSize: 13.5, lineHeight: 1.55 }}>
          <span style={{
            width: 18, height: 18, borderRadius: 3, marginTop: 2, flexShrink: 0,
            border: "1.5px solid var(--gl-brand)", background: "var(--gl-brand)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name="check" size={12} color="white" weight={500} />
          </span>
          <span>
            I confirm I’m authorised to bind the club, and that GreenLink will process personal information on the club’s written instruction, under the terms set out above and in our <a href="#" style={{ color: "var(--gl-brand)" }}>Operator Agreement</a>.
          </span>
        </label>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28 }}>
          <button className="gl-btn gl-btn--tertiary"><Icon name="arrow_back" size={14} /> Back</button>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="gl-btn gl-btn--secondary">Download a copy</button>
            <button className="gl-btn gl-btn--primary">Accept & continue <Icon name="arrow_forward" size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const PopiaRow = ({ icon, title, body, last }) => (
  <div style={{
    display: "flex", gap: 14, padding: "18px 22px",
    borderBottom: last ? "none" : "1px solid var(--gl-border-subtle)",
  }}>
    <Icon name={icon} size={20} color="var(--gl-heritage-500)" />
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
      <div className="gl-muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.55 }}>{body}</div>
    </div>
  </div>
);

/* ============================================================
   11 · Onboarding · Completion — restrained celebration.
   ============================================================ */
const OnboardingDoneAB = () => (
  <div className="gl" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--gl-surface)" }}>
    <header style={{ padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--gl-border-subtle)" }}>
      <Wordmark size={20} color="var(--gl-text-primary)" />
      <OnboardingProgress step={6} of={6} />
      <span style={{ width: 80 }} />
    </header>

    <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "stretch", overflow: "hidden" }}>
      <div style={{ flex: 1, maxWidth: 1040, padding: "56px 64px", display: "grid", gridTemplateColumns: "1fr 0.85fr", gap: 56, alignItems: "center" }}>
        <div>
          <div className="gl-eyebrow" style={{ marginBottom: 14 }}>Set up</div>
          <h1 className="gl-serif" style={{ margin: 0, fontSize: 60, lineHeight: 1.02, fontWeight: 500, letterSpacing: "-0.025em" }}>
            <em style={{ fontWeight: 500 }}>Umhlali Country Club</em><br/>is on GreenLink.
          </h1>
          <p style={{ marginTop: 18, fontSize: 16, lineHeight: 1.55, color: "var(--gl-text-secondary)", maxWidth: 460 }}>
            The tee sheet is live for the next 14 days. Sage Pastel Partner is bound. 1 248 members imported into 712 households. The first daily close runs tonight at 23:30.
          </p>

          <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
            <button className="gl-btn gl-btn--primary" data-size="lg">Open dashboard <Icon name="arrow_forward" size={16} /></button>
            <button className="gl-btn gl-btn--secondary" data-size="lg">Invite staff</button>
          </div>

          <div className="gl-muted" style={{ marginTop: 28, fontSize: 12 }}>
            We’ll send a confirmation to <span className="gl-mono">captain@umhlali.golf</span> and a courtesy note to your Information Officer.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <DoneRow icon="check_circle" title="Club configured" sub="Umhlali Country Club · KZN · founded 1934" />
          <DoneRow icon="check_circle" title="Course & tee sheet" sub="The Bluff · 8-minute slots · 14-day window" />
          <DoneRow icon="check_circle" title="Accounting bound" sub="Sage Pastel Partner · profile verified" />
          <DoneRow icon="check_circle" title="POPIA & Info Officer" sub="E. Mngomezulu designated · operator terms accepted" />
          <DoneRow icon="check_circle" title="Members imported" sub="1 248 members · 712 households · 6 membership types" />
          <DoneRow icon="check_circle" title="Communications" sub="Transactional mail verified · welcome message drafted" />
        </div>
      </div>
    </div>

    {/* Restrained celebration — single subtle pin flag motif at the foot */}
    <div style={{ borderTop: "1px solid var(--gl-border-subtle)", padding: "18px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "var(--gl-text-secondary)", fontSize: 12 }}>
      <span>Phase 6 onboarding · v1</span>
      <span>Need anything? <a href="#" style={{ color: "var(--gl-brand)" }}>Support stays on for 30 days at no charge.</a></span>
    </div>
  </div>
);

const DoneRow = ({ icon, title, sub }) => (
  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
    <Icon name={icon} size={20} color="var(--gl-state-checkedin)" fill={1} />
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
      <div className="gl-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{sub}</div>
    </div>
  </div>
);

Object.assign(window, {
  LoginAB, AdminShellAB, SettingsAB, OnboardingWelcomeAB, OnboardingPopiaAB, OnboardingDoneAB,
});
