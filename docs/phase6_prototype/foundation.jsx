// foundation.jsx — Foundation artboards: palette, typography, motion+icons+photo.

const PaletteBoard = () => (
  <div className="gl" style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
    <ArtboardHeader
      eyebrow="01 · Foundation"
      title="Colour"
      lead="Heritage Green anchors. Warm neutrals as canvas. One accent — Caddie Red — used like the Masters flag. A small secondary palette unlocks only on member connecting surfaces, at occasion-specific moments."
      right={<div className="gl-eyebrow">Tokens · Light</div>}
    />
    <div style={{ padding: "32px 40px", display: "flex", flexDirection: "column", gap: 36, overflow: "auto" }}>

      <section>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 className="gl-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}>Heritage — the anchor</h3>
          <span className="gl-muted gl-t-sm">Primary brand, key actions, navigation.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 12 }}>
          <Swatch name="50"  hex="#eef2f1" role="Wash" />
          <Swatch name="100" hex="#d5dedc" role="Hover bg" />
          <Swatch name="200" hex="#a8b9b6" role="Border" />
          <Swatch name="300" hex="#7a948f" role="Tint" />
          <Swatch name="400 · Fairway" hex="#5a7a79" role="Subtle brand" fg="#f7f4ec" />
          <Swatch name="500 · Heritage" hex="#3a5a59" role="Primary brand" fg="#f7f4ec" />
          <Swatch name="600" hex="#2f4a48" role="Hover" fg="#f7f4ec" />
          <Swatch name="700 · Deep Pine" hex="#2a4544" role="Pressed" fg="#f7f4ec" />
          <Swatch name="800" hex="#1e3331" role="Dark brand" fg="#f7f4ec" />
          <Swatch name="900" hex="#14211f" role="Dark canvas" fg="#f7f4ec" />
        </div>
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 className="gl-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}>Neutrals — the canvas</h3>
          <span className="gl-muted gl-t-sm">Five-step scale: surface → border → primary text.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
          <Swatch name="Parchment" hex="#f7f4ec" role="Primary surface" size="lg" />
          <Swatch name="Fog"       hex="#ece7da" role="Secondary surface · card" size="lg" />
          <Swatch name="Stone"     hex="#c4bfb0" role="Border · divider" size="lg" />
          <Swatch name="Slate"     hex="#6a655c" role="Secondary text · icon" size="lg" fg="#f7f4ec" />
          <Swatch name="Charcoal"  hex="#26221c" role="Primary text" size="lg" fg="#f7f4ec" />
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 className="gl-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}>The accent</h3>
            <span className="gl-muted gl-t-sm">One only · admin + staff.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Swatch name="Caddie 200" hex="#e3c4c4" role="Wash · highlight" />
            <Swatch name="Caddie · 500" hex="#a83a3a" role="Critical · key CTA" fg="#f7f4ec" />
            <Swatch name="Caddie 700" hex="#8b2f2f" role="Hover" fg="#f7f4ec" />
          </div>
          <p className="gl-muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 12, marginBottom: 0 }}>
            Used like a course-rating plaque: rare, meaningful, never decorative. Status, errors, and the one CTA that converts.
          </p>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 className="gl-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}>Member secondary</h3>
            <span className="gl-muted gl-t-sm">Permission-gated · moments only.</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Swatch name="Flamingo" hex="#d97a64" role="Handicap · tournament" fg="#26221c" />
            <Swatch name="Honey"    hex="#c98841" role="Badges · achievements" fg="#26221c" />
            <Swatch name="Waterway" hex="#4f7574" role="Social · community" fg="#f7f4ec" />
          </div>
          <p className="gl-muted" style={{ fontSize: 12, lineHeight: 1.5, marginTop: 12, marginBottom: 0 }}>
            None of these appear on admin or staff surfaces. None pervasive even on member surfaces — earned at specific moments, single accent per view.
          </p>
        </div>
      </section>

      <section>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <h3 className="gl-serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}>Tee-sheet state — deuteranopia-safe</h3>
          <span className="gl-muted gl-t-sm">State distinguished by luminance + icon + label, not hue alone.</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          <StateChip name="Open"       color="var(--gl-state-open)"      fg="#26221c" icon="schedule"          sample="07:18" />
          <StateChip name="Booked"     color="var(--gl-state-booked)"    fg="#f7f4ec" icon="event_available"   sample="4-ball" />
          <StateChip name="Checked-in" color="var(--gl-state-checkedin)" fg="#f7f4ec" icon="how_to_reg"        sample="all 4" />
          <StateChip name="At-risk"    color="var(--gl-state-atrisk)"    fg="#26221c" icon="warning_amber"     sample="2 unc." />
          <StateChip name="No-show"    color="var(--gl-state-noshow)"    fg="#f7f4ec" icon="cancel"            sample="07:10" />
          <StateChip name="Blocked"    color="var(--gl-state-blocked)"   fg="#f7f4ec" icon="block"             sample="comp" />
        </div>
      </section>

    </div>
  </div>
);

const TypeBoard = () => (
  <div className="gl" style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
    <ArtboardHeader
      eyebrow="02 · Foundation"
      title="Typography"
      lead="A serif for moments that establish identity. A workhorse sans for body, UI, and data. The pairing is the discipline — serif alone reads old, sans alone reads generic SaaS, together they read as premium product built thoughtfully."
      right={<div className="gl-eyebrow">Source Serif 4 · IBM Plex Sans</div>}
    />
    <div style={{ padding: "32px 40px", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 40, overflow: "auto" }}>

      {/* Left — type scale */}
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div className="gl-eyebrow">Scale · 8 steps</div>

        <ScaleRow label="Display · Serif 500"  cls="gl-t-display gl-serif" sample="A breathing course" />
        <ScaleRow label="3xl · Serif 500"      cls="gl-t-3xl gl-serif"     sample="The eleventh at dawn" />
        <ScaleRow label="2xl · Sans 500"       cls="gl-t-2xl"              sample="Today’s starter sheet" style={{ fontWeight: 500 }} />
        <ScaleRow label="xl · Sans 500"        cls="gl-t-xl"               sample="Pricing rules, weekend" style={{ fontWeight: 500 }} />
        <ScaleRow label="lg · Sans 400"        cls="gl-t-lg"               sample="Members may book up to 14 days in advance for confirmed tee times." />
        <ScaleRow label="md · Sans 400"        cls="gl-t-md"               sample="Default body. Restraint as luxury — what isn’t on the page does the heavy lifting." />
        <ScaleRow label="sm · Sans 400"        cls="gl-t-sm"               sample="Helper copy, microcopy, secondary information runs at this size." />
        <ScaleRow label="xs · Sans 500 · CAPS" cls="gl-t-xs"               sample="LABEL · EYEBROW · METADATA" />
      </div>

      {/* Right — pairing in use + tabular figures */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="gl-eyebrow">The pairing, in use</div>

        <div className="gl-card">
          <div className="gl-eyebrow" style={{ marginBottom: 14 }}>Member moment · handicap</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
            <div className="gl-serif" style={{ fontSize: 96, lineHeight: 1, letterSpacing: "-0.03em", fontWeight: 500, color: "var(--gl-heritage-700)" }}>11.4</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span className="gl-muted gl-t-sm">Course Handicap</span>
              <span className="gl-t-sm" style={{ color: "var(--gl-flamingo)" }}>▾ 0.6 since April</span>
            </div>
          </div>
          <div style={{ marginTop: 18, fontSize: 13, lineHeight: 1.55, color: "var(--gl-text-secondary)" }}>
            Hero numerals run in <em className="gl-serif">italic serif</em> for character; the supporting labels stay in workhorse sans.
          </div>
        </div>

        <div className="gl-card">
          <div className="gl-eyebrow" style={{ marginBottom: 14 }}>Finance · tabular figures</div>
          <table className="gl-table gl-tabular" style={{ marginTop: 4 }}>
            <thead>
              <tr><th>GL</th><th>Description</th><th className="num">Debit</th><th className="num">Credit</th></tr>
            </thead>
            <tbody>
              <tr><td className="gl-mono">4100-01</td><td>Green fees · weekend</td><td className="num">—</td><td className="num">R 18 240.00</td></tr>
              <tr><td className="gl-mono">4220-03</td><td>Cart hire</td><td className="num">—</td><td className="num">R  4 760.00</td></tr>
              <tr><td className="gl-mono">5310-00</td><td>Bank · settlement</td><td className="num">R 22 882.50</td><td className="num">—</td></tr>
              <tr><td className="gl-mono">2200-00</td><td>VAT control · output</td><td className="num">—</td><td className="num">R  2 992.50</td></tr>
            </tbody>
          </table>
        </div>

        <div className="gl-card gl-card--sunken">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span className="gl-serif" style={{ fontSize: 28, fontWeight: 500, letterSpacing: "-0.01em" }}>“</span>
            <span className="gl-serif" style={{ fontSize: 16, fontStyle: "italic", color: "var(--gl-text-primary)", lineHeight: 1.5 }}>
              MacKenzie’s bunkers were artificially constructed but the world’s greatest artist would find it impossible to tell where nature ended and artificiality commenced.
            </span>
          </div>
          <div className="gl-muted gl-t-sm" style={{ marginTop: 8 }}>— used as a working test: if a UI element looks like it’s trying to impress, it’s wrong.</div>
        </div>
      </div>
    </div>
  </div>
);

const ScaleRow = ({ label, cls, sample, style }) => (
  <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 20, alignItems: "baseline", borderBottom: "1px solid var(--gl-border-subtle)", paddingBottom: 14 }}>
    <div className="gl-t-xs gl-muted">{label}</div>
    <div className={cls} style={style}>{sample}</div>
  </div>
);

const MotionBoard = () => (
  <div className="gl" style={{ width: "100%", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
    <ArtboardHeader
      eyebrow="03 · Foundation"
      title="Motion, Iconography & Photography"
      lead="Motion is function or it doesn’t exist. Material Symbols Outlined as the foundation icon set, restrained at default weight. Photography appears as moments, never as wallpaper."
    />
    <div style={{ padding: "32px 40px", display: "grid", gridTemplateColumns: "1fr 1fr 1.1fr", gap: 32, overflow: "auto" }}>
      {/* Motion */}
      <div>
        <div className="gl-eyebrow" style={{ marginBottom: 14 }}>Motion · three categories</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <MotionRow label="Functional" surfaces="Everywhere" duration="180ms" easing="standard"
                     desc="State transitions, drawer entrances, validation. Brief, eased, never bouncy." />
          <MotionRow label="Confirmation" surfaces="Member only · at completion" duration="320ms" easing="standard"
                     desc="Booking confirmed, score posted, payment success. Slightly more expressive but still restrained." />
          <MotionRow label="Celebration" surfaces="Member only · at milestones" duration="520ms" easing="emphatic"
                     desc="Handicap milestone, tournament won, member anniversary. Tasteful — never confetti-bomb." />
        </div>
        <div className="gl-card gl-card--sunken" style={{ marginTop: 18 }}>
          <div className="gl-eyebrow" style={{ marginBottom: 10 }}>Reduced motion</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--gl-text-secondary)" }}>
            All motion has a no-motion variant. Celebration falls back to a static state change. No motion above 600ms. No autoplay.
          </div>
        </div>
      </div>

      {/* Iconography */}
      <div>
        <div className="gl-eyebrow" style={{ marginBottom: 14 }}>Icons · Material Symbols Outlined</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, alignItems: "center" }}>
          {["calendar_month","event_available","how_to_reg","groups","payments","receipt_long",
            "golf_course","sports_golf","trending_up","warning_amber","schedule","mail",
            "search","filter_list","tune","settings","person","logout"].map(n => (
            <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 8, border: "1px solid var(--gl-border-subtle)", borderRadius: 6, background: "var(--gl-surface-raised)" }}>
              <Icon name={n} size={22} color="var(--gl-text-primary)" />
              <span className="gl-mono" style={{ fontSize: 9, color: "var(--gl-text-secondary)" }}>{n}</span>
            </div>
          ))}
        </div>
        <div className="gl-card" style={{ marginTop: 18 }}>
          <div className="gl-eyebrow" style={{ marginBottom: 10 }}>Permitted illustration · member only</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <PinFlag size={42} />
            <PinFlag size={42} color="var(--gl-heritage-700)" flag="var(--gl-flamingo)" />
            <PinFlag size={42} color="var(--gl-heritage-700)" flag="var(--gl-honey)" />
            <div style={{ flex: 1, fontSize: 12, color: "var(--gl-text-secondary)", lineHeight: 1.5 }}>
              The faded flamingo at the foot of a tournament menu is decoration that earns its place. Commissioned moments, not pervasive marks.
            </div>
          </div>
        </div>
      </div>

      {/* Photography */}
      <div>
        <div className="gl-eyebrow" style={{ marginBottom: 14 }}>Photography · moments, never wallpaper</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ borderRadius: 6, overflow: "hidden", aspectRatio: "4/3" }}>
            <HeroPlaceholder tone="dawn" style={{ width: "100%", height: "100%" }} />
          </div>
          <div style={{ borderRadius: 6, overflow: "hidden", aspectRatio: "4/3" }}>
            <HeroPlaceholder tone="course" style={{ width: "100%", height: "100%" }} />
          </div>
          <div style={{ borderRadius: 6, overflow: "hidden", aspectRatio: "4/3", gridColumn: "1 / -1" }}>
            <HeroPlaceholder tone="mist" style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
        <ul style={{ marginTop: 16, paddingLeft: 18, color: "var(--gl-text-secondary)", fontSize: 12, lineHeight: 1.7 }}>
          <li>Golden-hour light, low sun raking across fairways.</li>
          <li>Wide horizon, single subject — one moment, not everything.</li>
          <li>Mist, dew, the course breathing in early morning.</li>
          <li>No people in brand photography; the course is the subject.</li>
          <li>One beautifully framed image at login, dashboard hero, portal home.</li>
        </ul>
      </div>
    </div>
  </div>
);

const MotionRow = ({ label, surfaces, duration, easing, desc }) => (
  <div className="gl-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
      <div className="gl-serif" style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.005em" }}>{label}</div>
      <div className="gl-mono" style={{ fontSize: 11, color: "var(--gl-text-secondary)" }}>{duration} · {easing}</div>
    </div>
    <div className="gl-t-xs gl-muted">{surfaces}</div>
    <div style={{ fontSize: 12, color: "var(--gl-text-secondary)", lineHeight: 1.5 }}>{desc}</div>
  </div>
);

Object.assign(window, { PaletteBoard, TypeBoard, MotionBoard });
