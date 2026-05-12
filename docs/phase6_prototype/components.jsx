// components.jsx — Components artboards: buttons & inputs, cards/tables/badges/states.

const ComponentsAB = () => (
  <div className="gl" style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
    <ArtboardHeader
      eyebrow="04 · Foundation"
      title="Buttons & Forms"
      lead="Every interactive primitive defined as one component with named variants and states. Same focus ring everywhere. Touch targets meet 44px on mobile, 32px on desktop. No exceptions."
    />
    <div style={{ padding: "32px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, overflow: "auto" }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Subhead title="Buttons" hint="primary · secondary · tertiary · destructive" />

        <Row label="Primary">
          <button className="gl-btn gl-btn--primary">Save changes</button>
          <button className="gl-btn gl-btn--primary" data-size="sm">Save</button>
          <button className="gl-btn gl-btn--primary" data-size="lg">Save changes</button>
          <button className="gl-btn gl-btn--primary" disabled>Saving…</button>
        </Row>
        <Row label="Secondary">
          <button className="gl-btn gl-btn--secondary">Cancel</button>
          <button className="gl-btn gl-btn--secondary">
            <Icon name="filter_list" size={16} />Filter
          </button>
          <button className="gl-btn gl-btn--secondary" data-size="lg">Add new course</button>
        </Row>
        <Row label="Tertiary">
          <button className="gl-btn gl-btn--tertiary">View details</button>
          <button className="gl-btn gl-btn--tertiary"><Icon name="arrow_back" size={14} /> Back</button>
        </Row>
        <Row label="Destructive">
          <button className="gl-btn gl-btn--destructive">Remove member</button>
          <button className="gl-btn gl-btn--secondary" style={{ borderColor: "var(--gl-caddie)", color: "var(--gl-caddie)" }}>Remove</button>
        </Row>

        <div className="gl-divider" style={{ margin: "8px 0" }} />

        <Subhead title="Toggles & control groups" hint="segmented · switch · checkbox · radio" />

        <Row label="Segmented">
          <div style={{ display: "inline-flex", border: "1px solid var(--gl-border-strong)", borderRadius: 6, overflow: "hidden" }}>
            {["Day", "Week", "Month"].map((t, i) => (
              <button key={t} className="gl-btn" style={{
                background: i === 0 ? "var(--gl-charcoal)" : "transparent",
                color:      i === 0 ? "var(--gl-parchment)" : "var(--gl-text-primary)",
                borderRadius: 0, borderRight: i < 2 ? "1px solid var(--gl-border-strong)" : "none",
                height: 32, padding: "0 14px",
              }}>{t}</button>
            ))}
          </div>
        </Row>

        <Row label="Switch">
          <Switch on={true} label="Email reservations" />
          <Switch on={false} label="SMS reservations" />
        </Row>

        <Row label="Checkbox">
          <CheckRow label="Bind to Sage Pastel Partner" checked />
          <CheckRow label="Bind to Sage 200 Evolution" />
        </Row>

        <Row label="Radio">
          <RadioRow label="Member · weekend rate" checked />
          <RadioRow label="Guest · weekend rate" />
        </Row>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <Subhead title="Inputs" hint="default · focus · error · disabled · with helper" />

        <div>
          <label className="gl-label">Email</label>
          <input className="gl-input" defaultValue="captain@umhlali.golf" />
          <div className="gl-help">Used for transactional mail and account recovery.</div>
        </div>

        <div>
          <label className="gl-label">Course name</label>
          <input className="gl-input" placeholder="e.g. The Bluff" />
        </div>

        <div>
          <label className="gl-label">Member number</label>
          <input className="gl-input" defaultValue="MEM-0040 8a" aria-invalid="true" />
          <div className="gl-err"><Icon name="error" size={14} color="var(--gl-caddie)" /> Doesn’t match the pattern <span className="gl-mono">MEM-XXXX</span></div>
        </div>

        <div>
          <label className="gl-label">Slot interval</label>
          <div style={{ position: "relative" }}>
            <input className="gl-input gl-tabular" defaultValue="8 minutes" disabled />
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--gl-text-secondary)" }}>
              <Icon name="expand_more" size={18} />
            </span>
          </div>
          <div className="gl-help">Inherited from club default. Override per-course in <a href="#" style={{ color: "var(--gl-brand)" }}>Course settings</a>.</div>
        </div>

        <div>
          <label className="gl-label">Search</label>
          <div className="gl-input" style={{ paddingLeft: 12 }}>
            <Icon name="search" size={16} color="var(--gl-text-secondary)" />
            <input style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "inherit", font: "inherit", fontSize: 13 }} placeholder="Search members, GL codes, dates…" />
            <span className="gl-kbd">⌘K</span>
          </div>
        </div>

        <div>
          <label className="gl-label">Notes</label>
          <textarea className="gl-input" rows={3} style={{ height: "auto", padding: 12, resize: "vertical" }} defaultValue="Comp slots blocked for greenkeeper aeration — Mon AM only." />
        </div>
      </section>
    </div>
  </div>
);

const Subhead = ({ title, hint }) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "1px solid var(--gl-border-subtle)", paddingBottom: 8 }}>
    <h3 className="gl-serif" style={{ margin: 0, fontSize: 20, fontWeight: 500, letterSpacing: "-0.005em" }}>{title}</h3>
    <span className="gl-muted gl-t-xs">{hint}</span>
  </div>
);
const Row = ({ label, children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 16, alignItems: "center" }}>
    <div className="gl-t-xs gl-muted">{label}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{children}</div>
  </div>
);

const Switch = ({ on, label }) => (
  <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
    <span style={{
      width: 34, height: 20, borderRadius: 999,
      background: on ? "var(--gl-brand)" : "var(--gl-stone)",
      position: "relative", transition: "background 180ms",
    }}>
      <span style={{
        position: "absolute", top: 2, left: on ? 16 : 2, width: 16, height: 16,
        borderRadius: 999, background: "white",
        boxShadow: "0 1px 2px rgba(0,0,0,0.18)", transition: "left 180ms",
      }} />
    </span>
    <span style={{ fontSize: 13 }}>{label}</span>
  </label>
);
const CheckRow = ({ label, checked }) => (
  <label style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
    <span style={{
      width: 16, height: 16, borderRadius: 3,
      border: "1.5px solid " + (checked ? "var(--gl-brand)" : "var(--gl-border-strong)"),
      background: checked ? "var(--gl-brand)" : "transparent",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      {checked && <Icon name="check" size={12} color="white" weight={500} />}
    </span>
    <span style={{ fontSize: 13 }}>{label}</span>
  </label>
);
const RadioRow = ({ label, checked }) => (
  <label style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
    <span style={{
      width: 16, height: 16, borderRadius: 999,
      border: "1.5px solid " + (checked ? "var(--gl-brand)" : "var(--gl-border-strong)"),
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      {checked && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--gl-brand)" }} />}
    </span>
    <span style={{ fontSize: 13 }}>{label}</span>
  </label>
);

const SurfacesCatalogueAB = () => (
  <div className="gl" style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
    <ArtboardHeader
      eyebrow="05 · Foundation"
      title="Surfaces — cards, tables, status, empty + loading"
      lead="The structural components. Tables earn finance-grade tabular numerals. Status pairs colour with icon and label so colour is never the only signal. Empty states get the same care as the dashboard hero."
    />
    <div style={{ padding: "32px 40px", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 30, overflow: "auto" }}>

      {/* Left column — table + badges + alerts */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <Subhead title="Finance-grade table" hint="tabular figures · sortable · row hover" />
          <div className="gl-card" style={{ padding: 0, marginTop: 12, overflow: "hidden" }}>
            <table className="gl-table">
              <thead>
                <tr>
                  <th>Date <Icon name="arrow_downward" size={12} color="var(--gl-text-primary)" /></th>
                  <th>Description</th>
                  <th>Member</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["12 May", "Green fees · weekend", "M. Dlamini",      "R 540.00", "Reconciled", "ok"],
                  ["12 May", "Cart hire ×2",          "T. Botha",        "R 280.00", "Reconciled", "ok"],
                  ["11 May", "F&B · halfway house",   "Walk-in (cash)",  "R 142.50", "Pending",    "warn"],
                  ["11 May", "Membership · debit",    "K. Naidoo",       "R 1 850.00","Failed",    "err"],
                  ["10 May", "Pro shop · apparel",    "G. van Wyk",      "R 2 240.00","Reconciled","ok"],
                ].map(([d, desc, m, amt, status, kind], i) => (
                  <tr key={i}>
                    <td className="gl-mono" style={{ color: "var(--gl-text-secondary)" }}>{d}</td>
                    <td>{desc}</td>
                    <td className="gl-muted">{m}</td>
                    <td className="num gl-tabular">{amt}</td>
                    <td><StatusPill kind={kind}>{status}</StatusPill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <Subhead title="Badges & status pills" hint="status · membership type · role" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            <span className="gl-badge" style={{ color: "var(--gl-heritage-700)" }}><span className="dot" />Full Member</span>
            <span className="gl-badge" style={{ color: "var(--gl-flamingo)" }}><span className="dot" />Junior</span>
            <span className="gl-badge" style={{ color: "var(--gl-honey)" }}><span className="dot" />Country</span>
            <span className="gl-badge" style={{ color: "var(--gl-waterway)" }}><span className="dot" />Reciprocal</span>
            <span className="gl-badge" style={{ color: "var(--gl-slate)" }}><span className="dot" />Honorary</span>
            <span className="gl-badge" style={{ color: "var(--gl-caddie)" }}><span className="dot" />Suspended</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            <RolePill role="GM" />
            <RolePill role="Ops" />
            <RolePill role="Finance" />
            <RolePill role="Pro shop" />
            <RolePill role="Halfway" />
            <RolePill role="Marshal" />
          </div>
        </div>

        <div>
          <Subhead title="Alerts" hint="info · success · warning · error · restrained chrome" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            <Alert kind="info"    icon="info"    title="Daily close runs at 23:30"           body="No staff action required. Audit log will surface any unmatched lines tomorrow at 06:00." />
            <Alert kind="warning" icon="warning_amber" title="Two transactions need attention" body="K. Naidoo · membership debit failed (NSF). M. Reddy · POS variance R 12.50." />
            <Alert kind="error"   icon="error"   title="Sage export blocked"                  body="Accounting profile is missing the VAT control account. Edit in Settings → Club → Accounting." />
          </div>
        </div>
      </div>

      {/* Right column — cards + empty + loading + toast */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div>
          <Subhead title="Cards" hint="content container · hover lifts subtly" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div className="gl-card">
              <div className="gl-t-xs gl-muted">Today · 12 May</div>
              <div className="gl-serif" style={{ fontSize: 28, fontWeight: 500, marginTop: 6, letterSpacing: "-0.01em" }}>R 41 482</div>
              <div className="gl-muted gl-t-sm">Gross takings · all tills</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 10, color: "var(--gl-state-checkedin)", fontSize: 12 }}>
                <Icon name="trending_up" size={14} /> 6.4% on Saturday average
              </div>
            </div>
            <div className="gl-card">
              <div className="gl-t-xs gl-muted">Tee sheet · live</div>
              <div className="gl-serif" style={{ fontSize: 28, fontWeight: 500, marginTop: 6, letterSpacing: "-0.01em" }}>92<span style={{ color: "var(--gl-text-secondary)", fontSize: 18 }}> / 104</span></div>
              <div className="gl-muted gl-t-sm">Slots booked</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 10, color: "var(--gl-state-atrisk)", fontSize: 12 }}>
                <Icon name="warning_amber" size={14} /> 3 at-risk (incomplete fourballs)
              </div>
            </div>
          </div>
        </div>

        <div>
          <Subhead title="Empty state · Parchment · single line" hint="never blank · optional secondary action" />
          <div className="gl-card" style={{ marginTop: 12, padding: 40, textAlign: "center", borderStyle: "dashed", background: "var(--gl-surface)" }}>
            <div style={{ width: 44, height: 44, borderRadius: 999, background: "var(--gl-surface-2)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="event_busy" size={22} color="var(--gl-text-secondary)" />
            </div>
            <div className="gl-serif" style={{ marginTop: 16, fontSize: 20, fontWeight: 500, letterSpacing: "-0.005em" }}>No bookings on this slot</div>
            <p className="gl-muted" style={{ fontSize: 13, marginTop: 6, marginBottom: 18 }}>Drag a member from the directory or add a walk-in.</p>
            <div style={{ display: "inline-flex", gap: 8 }}>
              <button className="gl-btn gl-btn--primary"><Icon name="add" size={16} /> Add walk-in</button>
              <button className="gl-btn gl-btn--secondary">Block slot</button>
            </div>
          </div>
        </div>

        <div>
          <Subhead title="Loading · skeleton matches layout" hint="not a generic spinner" />
          <div className="gl-card" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Skel w="48%" h={16} />
              <Skel w="78%" h={12} />
              <Skel w="68%" h={12} />
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <Skel w={80} h={28} />
                <Skel w={120} h={28} />
              </div>
            </div>
          </div>
        </div>

        <div>
          <Subhead title="Toast" hint="aria-live · auto-dismiss · stack of 3 max" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            <Toast kind="ok" title="Settings saved" body="Accounting profile bound to Sage Pastel Partner." />
            <Toast kind="warn" title="2 lines need a GL code" body="Open the daily close to assign." />
          </div>
        </div>
      </div>
    </div>
  </div>
);

const StatusPill = ({ kind, children }) => {
  const map = {
    ok:   { c: "var(--gl-state-checkedin)", bg: "color-mix(in oklab, var(--gl-state-checkedin) 14%, transparent)", icon: "check_circle" },
    warn: { c: "var(--gl-state-atrisk)",    bg: "color-mix(in oklab, var(--gl-state-atrisk) 18%, transparent)",    icon: "warning_amber" },
    err:  { c: "var(--gl-caddie)",          bg: "color-mix(in oklab, var(--gl-caddie) 14%, transparent)",          icon: "error" },
  }[kind];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "2px 8px", borderRadius: 999,
      background: map.bg, color: map.c,
      fontSize: 11, letterSpacing: "0.03em", textTransform: "uppercase", fontWeight: 500,
    }}>
      <Icon name={map.icon} size={12} color={map.c} /> {children}
    </span>
  );
};

const RolePill = ({ role }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    height: 22, padding: "0 8px",
    background: "var(--gl-surface-2)", color: "var(--gl-text-primary)",
    border: "1px solid var(--gl-border-subtle)",
    borderRadius: 4, fontSize: 11, fontWeight: 500, letterSpacing: "0.02em",
  }}>
    <Icon name="badge" size={12} color="var(--gl-text-secondary)" /> {role}
  </span>
);

const Alert = ({ kind, icon, title, body }) => {
  const c = kind === "warning" ? "var(--gl-state-atrisk)" :
            kind === "error"   ? "var(--gl-caddie)"        :
            kind === "info"    ? "var(--gl-heritage-500)"  :
                                 "var(--gl-state-checkedin)";
  return (
    <div className="gl-card" style={{
      borderLeft: `3px solid ${c}`,
      display: "flex", gap: 12, padding: "12px 14px",
    }}>
      <Icon name={icon} size={18} color={c} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--gl-text-secondary)", marginTop: 2, lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  );
};

const Skel = ({ w, h }) => (
  <div style={{
    width: typeof w === "number" ? w : w,
    height: h, borderRadius: 4,
    background: "linear-gradient(90deg, var(--gl-surface-2) 0%, var(--gl-fog) 50%, var(--gl-surface-2) 100%)",
    backgroundSize: "200% 100%",
    animation: "glSkel 1.4s linear infinite",
  }} />
);

const Toast = ({ kind, title, body }) => {
  const c = kind === "warn" ? "var(--gl-state-atrisk)" : "var(--gl-state-checkedin)";
  return (
    <div className="gl-card" style={{
      display: "flex", gap: 12, padding: "12px 14px",
      boxShadow: "var(--gl-shadow-pop)",
    }}>
      <span style={{ width: 4, alignSelf: "stretch", background: c, borderRadius: 4 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--gl-text-secondary)", marginTop: 2 }}>{body}</div>
      </div>
      <Icon name="close" size={16} color="var(--gl-text-secondary)" />
    </div>
  );
};

Object.assign(window, { ComponentsAB, SurfacesCatalogueAB });
