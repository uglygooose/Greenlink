// Path: frontend/src/components/ui/Input.tsx — Phase 7 primitive.
// Wraps native input with .gl-input. Renders label, helper, and error inline
// so consumers don't have to wire the aria-* plumbing themselves.
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  type?: "text" | "email" | "password" | "number" | "tel" | "url" | "search";
  label?: ReactNode;
  helperText?: ReactNode;
  errorText?: ReactNode;
  leadingIcon?: ReactNode;
  trailingAdornment?: ReactNode;
  tabular?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    type = "text",
    label,
    helperText,
    errorText,
    leadingIcon,
    trailingAdornment,
    tabular = false,
    id,
    className,
    "aria-invalid": ariaInvalidProp,
    "aria-describedby": describedByProp,
    ...rest
  },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const helperId = helperText ? `${inputId}-help` : undefined;
  const errorId = errorText ? `${inputId}-err` : undefined;
  const ariaInvalid = ariaInvalidProp ?? (errorText ? true : undefined);
  const describedBy = [describedByProp, helperId, errorId].filter(Boolean).join(" ") || undefined;

  // Composite wrapper when there's a leading icon or trailing adornment;
  // otherwise render the bare input with .gl-input directly.
  if (leadingIcon || trailingAdornment) {
    return (
      <div>
        {label ? (
          <label className="gl-label" htmlFor={inputId}>
            {label}
          </label>
        ) : null}
        <div className={`gl-input${tabular ? " gl-tabular" : ""}`} aria-invalid={ariaInvalid}>
          {leadingIcon}
          <input
            ref={ref}
            id={inputId}
            type={type}
            aria-invalid={ariaInvalid}
            aria-describedby={describedBy}
            className={className}
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: "transparent",
              color: "inherit",
              font: "inherit",
              fontSize: 13,
              width: "100%",
              padding: 0,
            }}
            {...rest}
          />
          {trailingAdornment}
        </div>
        {helperText ? (
          <div className="gl-help" id={helperId}>
            {helperText}
          </div>
        ) : null}
        {errorText ? (
          <div className="gl-err" id={errorId}>
            {errorText}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {label ? (
        <label className="gl-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        type={type}
        className={`gl-input${tabular ? " gl-tabular" : ""}${className ? ` ${className}` : ""}`}
        aria-invalid={ariaInvalid}
        aria-describedby={describedBy}
        {...rest}
      />
      {helperText ? (
        <div className="gl-help" id={helperId}>
          {helperText}
        </div>
      ) : null}
      {errorText ? (
        <div className="gl-err" id={errorId}>
          {errorText}
        </div>
      ) : null}
    </div>
  );
});
