// Path: frontend/src/components/ui/HeroPlaceholder.tsx — Phase 7 primitive.
// SVG-only brand-surface stand-in for the Brian Oar-style course photography
// that lands in v1.5. Three tones — dawn / course / mist — with sun glow,
// distant ridge, fairway, bunker shapes, lone tree silhouette, and grain.
// Ported verbatim from docs/phase6_prototype/system.jsx HeroPlaceholder.
import { useId, type CSSProperties } from "react";

export type HeroTone = "dawn" | "course" | "mist";

interface PaletteEntry {
  sky1: string;
  sky2: string;
  mid: string;
  land: string;
  fore: string;
  sun: string;
}

const PALETTES: Record<HeroTone, PaletteEntry> = {
  dawn: { sky1: "#3a4a4f", sky2: "#5d6b6c", mid: "#8a8f7e", land: "#3f4a3d", fore: "#26301f", sun: "#dcc28a" },
  course: { sky1: "#5b6c6a", sky2: "#9aa190", mid: "#7a8a6c", land: "#4f6149", fore: "#2c3a26", sun: "#e6cf8a" },
  mist: { sky1: "#7c857c", sky2: "#aab1a4", mid: "#a3a892", land: "#727a64", fore: "#3a4233", sun: "#d6cfac" },
};

export interface HeroPlaceholderProps {
  tone?: HeroTone;
  className?: string;
  style?: CSSProperties;
}

export function HeroPlaceholder({ tone = "dawn", className, style }: HeroPlaceholderProps): JSX.Element {
  const palette = PALETTES[tone];
  const skyId = useId();
  const landId = useId();
  const sunId = useId();
  const grainId = useId();
  return (
    <svg
      viewBox="0 0 800 500"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      style={{ display: "block", ...style }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.sky1} />
          <stop offset="100%" stopColor={palette.sky2} />
        </linearGradient>
        <linearGradient id={landId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.land} />
          <stop offset="100%" stopColor={palette.fore} />
        </linearGradient>
        <radialGradient id={sunId} cx="0.78" cy="0.32" r="0.18">
          <stop offset="0%" stopColor={palette.sun} stopOpacity="0.85" />
          <stop offset="100%" stopColor={palette.sun} stopOpacity="0" />
        </radialGradient>
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.12 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <rect width="800" height="500" fill={`url(#${skyId})`} />
      <rect width="800" height="500" fill={`url(#${sunId})`} />
      <path
        d="M0,260 C140,230 240,250 360,238 C500,225 620,255 800,232 L800,290 L0,290 Z"
        fill={palette.mid}
        opacity="0.75"
      />
      <path
        d="M0,310 C160,290 280,320 460,305 C600,293 700,322 800,308 L800,360 L0,360 Z"
        fill={palette.mid}
        opacity="0.55"
      />
      <path
        d="M0,330 C200,318 360,348 540,335 C660,326 740,340 800,335 L800,500 L0,500 Z"
        fill={`url(#${landId})`}
      />
      <ellipse cx="280" cy="390" rx="80" ry="12" fill={palette.sun} opacity="0.55" />
      <ellipse cx="500" cy="410" rx="120" ry="14" fill={palette.sun} opacity="0.40" />
      <g transform="translate(640,300)">
        <ellipse cx="0" cy="0" rx="22" ry="28" fill={palette.fore} />
        <rect x="-2" y="20" width="4" height="22" fill={palette.fore} />
      </g>
      <rect x="0" y="300" width="800" height="40" fill="#e8e3d2" opacity="0.16" />
      <rect width="800" height="500" filter={`url(#${grainId})`} opacity="0.45" />
    </svg>
  );
}
