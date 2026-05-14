// Path: frontend/src/features/tee-sheet/components/SlotIntervalToggle.tsx — Phase 10 Slice 11b.
// 4-button segmented control over the allowed slot intervals {6, 8, 10, 12}.
// Mounted on the right of the date strip. The selected value is driven by the
// response's `interval_minutes` field (truth-from-server, not local state),
// so a stale override never lingers if the backend overrides our request.
import { Segmented } from "../../../components/ui/Segmented";

const ALLOWED_VALUES = [6, 8, 10, 12] as const;
type AllowedValue = (typeof ALLOWED_VALUES)[number];

const OPTIONS = ALLOWED_VALUES.map((v) => ({ value: String(v), label: `${v}m` }));

export interface SlotIntervalToggleProps {
  selectedValue: number;
  onChange: (value: AllowedValue) => void;
}

export function SlotIntervalToggle({ selectedValue, onChange }: SlotIntervalToggleProps): JSX.Element {
  return (
    <Segmented
      value={String(selectedValue)}
      onChange={(next) => onChange(Number(next) as AllowedValue)}
      options={OPTIONS}
      label="Slot interval"
      className="gl-mono"
    />
  );
}
