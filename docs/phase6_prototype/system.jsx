// system.jsx — shared primitives (icons, swatches, small UI pieces)
// Loaded after React + Babel. Exposes globals via window assignment at end.

const Icon = ({ name, size = 18, color = "currentColor", weight = 400, fill = 0 }) => (
  <span
    className="material-symbols-outlined"
    aria-hidden="true"
    style={{
      fontSize: size,
      color,
      lineHeight: 1,
      fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
      verticalAlign: "middle",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >{name}</span>
);

// Wordmark — serif Capital + sans "link". Used in nav chrome.
const Wordmark = ({ size = 22, color = "currentColor" }) => (
  <span style={{ display: "inline-flex", alignItems: "baseline", gap: 0, color, lineHeight: 1 }}>
    <span style={{ fontFamily: "var(--gl-font-serif)", fontSize: size, fontWeight: 500, letterSpacing: "-0.02em" }}>Green</span>
    <span style={{ fontFamily: "var(--gl-font-sans)", fontSize: size * 0.92, fontWeight: 500, letterSpacing: "0.04em", textTransform: "lowercase" }}>link</span>
    <span style={{ width: 4, height: 4, borderRadius: 999, background: "var(--gl-caddie)", marginLeft: 4, transform: "translateY(-2px)" }} />
  </span>
);

// Small flag mark — used as a member-surface illustration moment.
const PinFlag = ({ size = 28, color = "var(--gl-heritage-500)", flag = "var(--gl-caddie)" }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M7 24V5" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    <path d="M7 5 L20 8 L14 11 L20 14 L7 14 Z" fill={flag} stroke={flag} strokeWidth="0.8" strokeLinejoin="round" />
    <ellipse cx="7" cy="24" rx="4" ry="1.2" fill={color} opacity="0.18" />
  </svg>
);

// Colour swatch card — used on the palette page.
const Swatch = ({ name, hex, role, fg, size = "md" }) => {
  const h = size === "lg" ? 120 : size === "sm" ? 64 : 88;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div
        style={{
          background: hex,
          height: h,
          borderRadius: "var(--gl-radius-md)",
          border: "1px solid var(--gl-border-subtle)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {fg && (
          <div style={{
            position: "absolute", left: 12, bottom: 10,
            color: fg, fontFamily: "var(--gl-font-serif)", fontSize: 26, lineHeight: 1, fontWeight: 500,
          }}>Aa</div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--gl-text-primary)" }}>{name}</div>
        <div className="gl-mono" style={{ fontSize: 11, color: "var(--gl-text-secondary)", letterSpacing: "0.02em" }}>{hex.toUpperCase()}</div>
        {role && <div style={{ fontSize: 11, color: "var(--gl-text-secondary)", marginTop: 2 }}>{role}</div>}
      </div>
    </div>
  );
};

// State chip — for the tee-sheet state palette
const StateChip = ({ name, color, fg = "white", icon, sample }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div
      style={{
        background: color, color: fg,
        borderRadius: "var(--gl-radius-sm)",
        padding: "10px 12px",
        display: "flex", alignItems: "center", gap: 8,
        border: name === "Open" ? "1px solid var(--gl-border)" : "1px solid transparent",
      }}
    >
      <Icon name={icon} size={16} color={fg} />
      <span style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.02em", textTransform: "uppercase" }}>{name}</span>
      {sample && (
        <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>{sample}</span>
      )}
    </div>
  </div>
);

// Material Symbols stylesheet — outlined, no fill by default.
// We rely on the Google Fonts link in the host HTML.

// SectionTitle for foundation artboards
const ArtboardHeader = ({ eyebrow, title, lead, right }) => (
  <div style={{
    display: "flex", alignItems: "flex-end", justifyContent: "space-between",
    padding: "32px 40px 28px 40px", borderBottom: "1px solid var(--gl-border-subtle)",
    gap: 24,
  }}>
    <div style={{ maxWidth: 720 }}>
      <div className="gl-eyebrow" style={{ marginBottom: 12 }}>{eyebrow}</div>
      <h2 className="gl-serif" style={{
        margin: 0, fontSize: 38, lineHeight: 1.08, letterSpacing: "-0.02em", fontWeight: 500,
      }}>{title}</h2>
      {lead && (
        <p style={{ marginTop: 12, marginBottom: 0, color: "var(--gl-text-secondary)", fontSize: 14, lineHeight: 1.55, maxWidth: 580 }}>{lead}</p>
      )}
    </div>
    {right}
  </div>
);

// Photo placeholder — a refined SVG stand-in for brand hero photography.
// Evokes wide horizon / golden hour / mist without resorting to stock.
const HeroPlaceholder = ({ tone = "dawn", className, style }) => {
  const palettes = {
    dawn: {
      sky1: "#3a4a4f", sky2: "#5d6b6c",
      mid: "#8a8f7e", land: "#3f4a3d", fore: "#26301f",
      sun: "#dcc28a",
    },
    course: {
      sky1: "#5b6c6a", sky2: "#9aa190",
      mid: "#7a8a6c", land: "#4f6149", fore: "#2c3a26",
      sun: "#e6cf8a",
    },
    mist: {
      sky1: "#7c857c", sky2: "#aab1a4",
      mid: "#a3a892", land: "#727a64", fore: "#3a4233",
      sun: "#d6cfac",
    },
  };
  const p = palettes[tone] || palettes.dawn;
  return (
    <svg
      viewBox="0 0 800 500"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ display: "block", ...style }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`sky-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky1} />
          <stop offset="100%" stopColor={p.sky2} />
        </linearGradient>
        <linearGradient id={`land-${tone}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.land} />
          <stop offset="100%" stopColor={p.fore} />
        </linearGradient>
        <radialGradient id={`sun-${tone}`} cx="0.78" cy="0.32" r="0.18">
          <stop offset="0%" stopColor={p.sun} stopOpacity="0.85" />
          <stop offset="100%" stopColor={p.sun} stopOpacity="0" />
        </radialGradient>
        <filter id={`grain-${tone}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.12 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <rect width="800" height="500" fill={`url(#sky-${tone})`} />
      {/* sun glow */}
      <rect width="800" height="500" fill={`url(#sun-${tone})`} />
      {/* distant ridge */}
      <path d="M0,260 C140,230 240,250 360,238 C500,225 620,255 800,232 L800,290 L0,290 Z"
            fill={p.mid} opacity="0.75" />
      {/* mid hill */}
      <path d="M0,310 C160,290 280,320 460,305 C600,293 700,322 800,308 L800,360 L0,360 Z"
            fill={p.mid} opacity="0.55" />
      {/* fairway */}
      <path d="M0,330 C200,318 360,348 540,335 C660,326 740,340 800,335 L800,500 L0,500 Z"
            fill={`url(#land-${tone})`} />
      {/* bunker shapes — sculptural */}
      <ellipse cx="280" cy="390" rx="80" ry="12" fill={p.sun} opacity="0.55" />
      <ellipse cx="500" cy="410" rx="120" ry="14" fill={p.sun} opacity="0.40" />
      {/* lone tree silhouette */}
      <g transform="translate(640,300)">
        <ellipse cx="0" cy="0" rx="22" ry="28" fill={p.fore} />
        <rect x="-2" y="20" width="4" height="22" fill={p.fore} />
      </g>
      {/* mist band */}
      <rect x="0" y="300" width="800" height="40" fill="#e8e3d2" opacity="0.16" />
      {/* grain texture */}
      <rect width="800" height="500" filter={`url(#grain-${tone})`} opacity="0.45" />
    </svg>
  );
};

Object.assign(window, {
  Icon, Wordmark, PinFlag, Swatch, StateChip, ArtboardHeader, HeroPlaceholder,
});
