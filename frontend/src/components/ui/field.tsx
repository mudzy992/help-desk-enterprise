import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
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

interface FieldProperties {
  readonly label: string;
  readonly required?: boolean;
  readonly hint?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Field({
  label,
  required,
  hint,
  children,
  className,
}: FieldProperties) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline gap-1 text-[12.5px] font-medium text-foreground">
        {label}
        {required ? <span className="text-danger">*</span> : null}
      </span>
      {children}
      {hint ? (
        <span className={cn("mt-1 block", hintClassName)}>{hint}</span>
      ) : null}
    </label>
  );
}
