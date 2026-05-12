// app.jsx — Stacked scrolling layout (replaces pan/zoom canvas).
// Each artboard sits inside a fixed-aspect frame; the page scrolls normally.
const { useState, useEffect, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "serif": "Source Serif 4",
  "sans": "IBM Plex Sans",
  "density": "default",
  "theme": "light"
}/*EDITMODE-END*/;

const SERIF_STACKS = {
  "Source Serif 4": "'Source Serif 4', 'Source Serif Pro', Georgia, serif",
  "Newsreader":     "'Newsreader', Georgia, serif",
  "Cormorant Garamond": "'Cormorant Garamond', Georgia, serif",
};
const SANS_STACKS = {
  "IBM Plex Sans":  "'IBM Plex Sans', system-ui, sans-serif",
  "Manrope":        "'Manrope', system-ui, sans-serif",
};

// Frame — renders a fixed-size artboard scaled down to fit the container width.
function Frame({ label, width, height, children }) {
  const wrap = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      const w = wrap.current?.clientWidth ?? width;
      const s = Math.min(1, w / width);
      setScale(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [width]);

  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <figcaption style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11, color: "rgba(38,34,28,0.6)", letterSpacing: "0.06em", textTransform: "uppercase",
      }}>
        <span>{label}</span>
        <span>{width} × {height}</span>
      </figcaption>
      <div ref={wrap} style={{ width: "100%" }}>
        <div style={{
          width: width * scale, height: height * scale,
          maxWidth: "100%",
          border: "1px solid rgba(38,34,28,0.12)",
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--gl-surface)",
          boxShadow: "0 1px 0 rgba(38,34,28,0.04), 0 8px 28px rgba(38,34,28,0.06)",
        }}>
          <div style={{
            width, height,
            transform: `scale(${scale})`, transformOrigin: "top left",
          }}>{children}</div>
        </div>
      </div>
    </figure>
  );
}

function SectionHeader({ idx, title, lead }) {
  return (
    <header style={{
      maxWidth: 1080, margin: "0 auto", padding: "64px 32px 24px 32px",
    }}>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11, color: "rgba(38,34,28,0.55)", letterSpacing: "0.18em", textTransform: "uppercase",
      }}>{idx}</div>
      <h2 style={{
        fontFamily: SERIF_STACKS["Source Serif 4"],
        margin: "10px 0 0 0", fontSize: 40, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.05,
      }}>{title}</h2>
      {lead && <p style={{
        marginTop: 12, marginBottom: 0, maxWidth: 640,
        color: "rgba(38,34,28,0.6)", fontSize: 15, lineHeight: 1.55,
      }}>{lead}</p>}
    </header>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    document.documentElement.style.setProperty("--gl-font-serif", SERIF_STACKS[t.serif] || SERIF_STACKS["Source Serif 4"]);
    document.documentElement.style.setProperty("--gl-font-sans",  SANS_STACKS[t.sans]   || SANS_STACKS["IBM Plex Sans"]);
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.density = t.density;
  }, [t.serif, t.sans, t.theme, t.density]);

  return (
    <React.Fragment>
      {/* Page-level intro */}
      <div style={{
        background: "#f0eee9",
        borderBottom: "1px solid rgba(38,34,28,0.08)",
        padding: "56px 32px 48px 32px",
      }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "baseline", gap: 0, color: "var(--gl-text-primary)",
          }}>
            <span style={{ fontFamily: "var(--gl-font-serif)", fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}>Green</span>
            <span style={{ fontFamily: "var(--gl-font-sans)",  fontSize: 20, fontWeight: 500, letterSpacing: "0.04em", textTransform: "lowercase" }}>link</span>
            <span style={{ width: 4, height: 4, borderRadius: 999, background: "var(--gl-caddie)", marginLeft: 4, transform: "translateY(-2px)" }} />
          </div>
          <h1 style={{
            fontFamily: "var(--gl-font-serif)",
            margin: "18px 0 0 0", fontSize: 56, fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.02,
          }}>Phase 6 — design&nbsp;system<br/>and first surfaces.</h1>
          <p style={{
            marginTop: 16, maxWidth: 640,
            color: "rgba(38,34,28,0.65)", fontSize: 16, lineHeight: 1.55,
          }}>
            Foundation tokens (palette, type, motion, components) and the first six surfaces — login, admin shell, settings, and three onboarding moments. Scroll through; use Tweaks (bottom-right) to switch serif/sans, density, or theme.
          </p>
        </div>
      </div>

      {/* —————————————————————————————————————————————————— */}
      <SectionHeader idx="01 · Foundation" title="The design language" lead="Colour, type, motion, components — defined before any surface."/>
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "0 32px 32px 32px", display: "flex", flexDirection: "column", gap: 28 }}>
        <Frame label="Palette" width={1400} height={1080}><PaletteBoard /></Frame>
        <Frame label="Typography" width={1400} height={1080}><TypeBoard /></Frame>
        <Frame label="Motion · Iconography · Photography" width={1400} height={760}><MotionBoard /></Frame>
        <Frame label="Buttons & Forms" width={1400} height={1080}><ComponentsAB /></Frame>
        <Frame label="Cards · Tables · States" width={1400} height={1080}><SurfacesCatalogueAB /></Frame>
      </main>

      <SectionHeader idx="02 · Brand surfaces" title="First impressions" lead="Traditional register at full discipline. Photography as a moment, never wallpaper."/>
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "0 32px 32px 32px", display: "flex", flexDirection: "column", gap: 28 }}>
        <Frame label="Login" width={1440} height={900}><LoginAB /></Frame>
        <Frame label="Onboarding · Welcome" width={1440} height={900}><OnboardingWelcomeAB /></Frame>
      </main>

      <SectionHeader idx="03 · Admin shell" title="Working surfaces" lead="Utility leads; the Traditional foundation holds — restraint as the discipline."/>
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "0 32px 32px 32px", display: "flex", flexDirection: "column", gap: 28 }}>
        <Frame label="Admin · Dashboard"     width={1440} height={900}><AdminShellAB density={t.density} /></Frame>
        <Frame label="Admin · Settings hub"  width={1440} height={900}><SettingsAB /></Frame>
      </main>

      <SectionHeader idx="04 · Onboarding · key moments" title="POPIA, first-class" lead="The lawful basis treated as a moment of trust. Completion as restrained recognition."/>
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "0 32px 80px 32px", display: "flex", flexDirection: "column", gap: 28 }}>
        <Frame label="Onboarding · POPIA"      width={1440} height={1080}><OnboardingPopiaAB /></Frame>
        <Frame label="Onboarding · Completion" width={1440} height={900}><OnboardingDoneAB /></Frame>
      </main>

      <footer style={{
        borderTop: "1px solid rgba(38,34,28,0.08)",
        padding: "24px 32px",
        textAlign: "center",
        color: "rgba(38,34,28,0.55)",
        fontSize: 12,
      }}>
        GreenLink · Phase 6 · v1 · Built in South Africa
      </footer>

      <TweaksPanel>
        <TweakSection title="Type">
          <TweakSelect label="Display serif"  value={t.serif} onChange={v => setTweak('serif', v)}
                       options={Object.keys(SERIF_STACKS)} />
          <TweakSelect label="Workhorse sans" value={t.sans}  onChange={v => setTweak('sans', v)}
                       options={Object.keys(SANS_STACKS)} />
        </TweakSection>
        <TweakSection title="System">
          <TweakRadio label="Density" value={t.density} onChange={v => setTweak('density', v)}
                      options={["comfortable","default","compact"]} />
          <TweakRadio label="Theme"   value={t.theme}   onChange={v => setTweak('theme', v)}
                      options={["light","dark"]} />
        </TweakSection>
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
