// Path: frontend/src/components/ui/Segmented.tsx — Phase 8 primitive.
// Inline button group, exactly one option selected. Selected segment carries
// charcoal-bg / parchment-fg chrome — the prototype's "filled segment" pattern
// used by the tee-sheet slot-interval toggle and finance export granularity.
import type { CSSProperties } from "react";

export interface SegmentedOption<TValue extends string> {
  value: TValue;
  label: string;
}

export interface SegmentedProps<TValue extends string> {
  value: TValue;
  onChange: (next: TValue) => void;
  options: ReadonlyArray<SegmentedOption<TValue>>;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Segmented<TValue extends string>({
  value,
  onChange,
  options,
  label,
  disabled = false,
  className,
}: SegmentedProps<TValue>): JSX.Element {
  const groupStyle: CSSProperties = {
    display: "inline-flex",
    border: "1px solid var(--gl-border-strong)",
    borderRadius: "var(--gl-radius-sm)",
    opacity: disabled ? 0.5 : 1,
  };
  return (
    <div role="radiogroup" aria-label={label} className={className} style={groupStyle}>
      {options.map((opt, i) => {
        const selected = opt.value === value;
        const segmentStyle: CSSProperties = {
          height: 24,
          padding: "0 8px",
          fontSize: 11,
          background: selected ? "var(--gl-charcoal)" : "transparent",
          color: selected ? "var(--gl-parchment)" : "var(--gl-text-secondary)",
          border: "none",
          borderRight: i < options.length - 1 ? "1px solid var(--gl-border-strong)" : "none",
          borderRadius: 0,
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "inherit",
          fontWeight: 500,
        };
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            style={segmentStyle}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
