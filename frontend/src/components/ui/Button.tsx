// Path: frontend/src/components/ui/Button.tsx — Phase 7 primitive.
// Variants: primary / secondary / tertiary / destructive. Sizes: sm / md / lg.
// References --gl-btn-* tokens; no arbitrary values.
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    loadingLabel,
    leadingIcon,
    trailingIcon,
    disabled,
    children,
    className,
    type = "button",
    ...rest
  },
  ref,
) {
  const variantClass = `gl-btn--${variant}`;
  const dataSize = size === "md" ? undefined : size;
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      data-size={dataSize}
      className={`gl-btn ${variantClass}${className ? ` ${className}` : ""}`}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {leadingIcon}
      <span>{loading ? loadingLabel ?? "Working…" : children}</span>
      {trailingIcon}
    </button>
  );
});
