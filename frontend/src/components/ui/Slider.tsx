// Path: frontend/src/components/ui/Slider.tsx — Phase 8 primitive.
// 3-px track in stone, brand-filled to the current value, 16-px thumb with a
// brand border. Renders a native range input absolutely-positioned on top so
// keyboard + screen-reader behaviour is the standard HTML slider semantics.
import { useId, type ChangeEvent, type CSSProperties } from "react";

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  disabled = false,
  className,
}: SliderProps): JSX.Element {
  const inputId = useId();
  const range = max - min;
  const pct = range > 0 ? ((value - min) / range) * 100 : 0;
  const clamped = Math.max(0, Math.min(100, pct));

  const wrapperStyle: CSSProperties = {
    position: "relative",
    height: 24,
    display: "flex",
    alignItems: "center",
    opacity: disabled ? 0.5 : 1,
  };
  const trackStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    height: 3,
    background: "var(--gl-stone)",
    borderRadius: "var(--gl-radius-pill)",
  };
  const fillStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    width: `${clamped}%`,
    height: 3,
    background: "var(--gl-brand)",
    borderRadius: "var(--gl-radius-pill)",
  };
  const thumbStyle: CSSProperties = {
    position: "absolute",
    left: `calc(${clamped}% - 8px)`,
    width: 16,
    height: 16,
    borderRadius: "var(--gl-radius-pill)",
    background: "var(--gl-surface-raised)",
    border: "1.5px solid var(--gl-brand)",
    boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
    pointerEvents: "none",
  };

  return (
    <div className={className} style={wrapperStyle}>
      <span style={trackStyle} aria-hidden="true" />
      <span style={fillStyle} aria-hidden="true" />
      <span style={thumbStyle} aria-hidden="true" />
      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          if (disabled) return;
          onChange(Number(e.target.value));
        }}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0,
          cursor: disabled ? "not-allowed" : "pointer",
          margin: 0,
          width: "100%",
        }}
      />
    </div>
  );
}
