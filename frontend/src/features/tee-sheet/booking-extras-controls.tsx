import { MaterialSymbol } from "../../components/benchmark/material-symbol";

interface ExtrasToggleButtonProps {
  active: boolean;
  icon: string;
  label: string;
  onToggle: () => void;
}

function ExtrasToggleButton({
  active,
  icon,
  label,
  onToggle,
}: ExtrasToggleButtonProps): JSX.Element {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
        active
          ? "border-primary/20 bg-primary-container/60 text-on-primary-container"
          : "border-slate-200 bg-white text-on-surface hover:bg-surface-container-low"
      }`}
      onClick={onToggle}
      type="button"
    >
      <MaterialSymbol className="text-base" icon={icon} />
      <span>{label}</span>
    </button>
  );
}

interface BookingExtrasControlsProps {
  caddieFlag: boolean;
  cartFlag: boolean;
  onCaddieFlagChange: (value: boolean) => void;
  onCartFlagChange: (value: boolean) => void;
}

export function BookingExtrasControls({
  caddieFlag,
  cartFlag,
  onCaddieFlagChange,
  onCartFlagChange,
}: BookingExtrasControlsProps): JSX.Element {
  return (
    <section className="space-y-3 rounded-2xl bg-surface-container-low p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Extras</p>
      <div className="flex flex-wrap gap-3">
        <ExtrasToggleButton
          active={cartFlag}
          icon="airport_shuttle"
          label="Cart"
          onToggle={() => onCartFlagChange(!cartFlag)}
        />
        <ExtrasToggleButton
          active={caddieFlag}
          icon="person"
          label="Caddie"
          onToggle={() => onCaddieFlagChange(!caddieFlag)}
        />
      </div>
    </section>
  );
}
