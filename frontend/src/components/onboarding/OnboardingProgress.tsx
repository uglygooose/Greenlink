// Path: frontend/src/components/onboarding/OnboardingProgress.tsx — Phase 7.
// Shared progress indicator across the three onboarding surfaces.

export interface OnboardingProgressProps {
  step: number;
  of: number;
}

export function OnboardingProgress({ step, of }: OnboardingProgressProps): JSX.Element {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={of}
      aria-valuenow={step}
      aria-label={`Step ${step} of ${of}`}
      style={{ display: "flex", alignItems: "center", gap: 10 }}
    >
      <div style={{ display: "flex", gap: 4 }} aria-hidden="true">
        {Array.from({ length: of }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 20,
              height: 3,
              borderRadius: 2,
              background: i < step ? "var(--gl-heritage-500)" : "var(--gl-stone)",
              transition: "background 180ms",
            }}
          />
        ))}
      </div>
      <span className="gl-mono" style={{ fontSize: 11 }}>
        Step {step} of {of}
      </span>
    </div>
  );
}
