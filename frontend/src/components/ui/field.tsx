import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  controlClassName,
  hintClassName,
  selectClassName,
  textareaClassName,
} from "@/components/ui/control";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...properties
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn(controlClassName, className)} {...properties} />
  );
}

export function Select({
  className,
  children,
  ...properties
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(selectClassName, className)} {...properties}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...properties
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(textareaClassName, className)} {...properties} />
  );
}

/** Props a Field hands to its control in the render-function form (2.8 §3.2). */
export interface FieldControlProps {
  readonly id: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
  readonly "aria-required"?: true;
  readonly "aria-errormessage"?: string;
}

interface FieldProperties {
  readonly label: string;
  readonly required?: boolean;
  readonly hint?: string;
  /** Validation message; marks the control invalid and is linked to it. */
  readonly error?: string | null;
  /**
   * Plain children keep the legacy wrapping-label form. A render function
   * receives id / aria-describedby / aria-invalid / aria-required for the control.
   */
  readonly children: ReactNode | ((control: FieldControlProps) => ReactNode);
  readonly className?: string;
  /** Explicit control id (otherwise generated). */
  readonly id?: string;
}

export function Field({
  label,
  required,
  hint,
  error,
  children,
  className,
  id: explicitId,
}: FieldProperties) {
  const { t } = useTranslation();
  const generatedId = useId();
  const controlId = explicitId ?? `field-${generatedId.replace(/:/g, "")}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const hasError = typeof error === "string" && error.length > 0;

  const labelContent = (
    <>
      {label}
      {required ? (
        <>
          <span className="text-danger" aria-hidden="true">
            *
          </span>
          {typeof children === "function" ? null : (
            <span className="sr-only">{t("a11y.requiredField")}</span>
          )}
        </>
      ) : null}
    </>
  );
  const hintNode = hint ? (
    <span id={hintId} className={cn("mt-1 block", hintClassName)}>
      {hint}
    </span>
  ) : null;
  const errorNode = hasError ? (
    <span id={errorId} className="mt-1 block text-[12px] font-medium text-danger">
      {error}
    </span>
  ) : null;

  if (typeof children === "function") {
    const describedBy = [hint ? hintId : null, hasError ? errorId : null]
      .filter((value): value is string => value !== null)
      .join(" ");
    const control: FieldControlProps = {
      id: controlId,
      ...(describedBy.length > 0 ? { "aria-describedby": describedBy } : {}),
      ...(hasError ? { "aria-invalid": true as const, "aria-errormessage": errorId } : {}),
      ...(required ? { "aria-required": true as const } : {}),
    };
    return (
      <div className={cn("block", className)}>
        <label
          htmlFor={controlId}
          className="mb-1.5 flex items-baseline gap-1 text-[12.5px] font-medium text-foreground"
        >
          {labelContent}
        </label>
        {children(control)}
        {hintNode}
        {errorNode}
      </div>
    );
  }

  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline gap-1 text-[12.5px] font-medium text-foreground">
        {labelContent}
      </span>
      {children}
      {hintNode}
      {errorNode}
    </label>
  );
}
