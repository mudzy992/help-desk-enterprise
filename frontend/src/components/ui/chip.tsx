import { X } from "lucide-react";
import type { ReactNode } from "react";
import {
  filterChipActiveClassName,
  filterChipClassName,
  filterChipDangerActiveClassName,
  filterChipIdleClassName,
} from "@/components/ui/control";
import { cn } from "@/lib/utils";

export type ChipTone = "default" | "danger";

interface ChipProperties {
  readonly active?: boolean;
  readonly tone?: ChipTone;
  readonly onClick?: () => void;
  readonly onRemove?: () => void;
  readonly removeLabel?: string;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Filter / token chip. Shares its classes with `filterChip*` in `control.ts`,
 * so chips written by hand and chips written as components stay identical.
 */
export function Chip({
  active = false,
  tone = "default",
  onClick,
  onRemove,
  removeLabel,
  icon,
  children,
  className,
}: ChipProperties) {
  const isInteractive = onClick !== undefined;

  const toneClassName = active
    ? tone === "danger"
      ? filterChipDangerActiveClassName
      : filterChipActiveClassName
    : filterChipIdleClassName;

  if (!isInteractive) {
    return (
      <span className={cn(filterChipClassName, toneClassName, className)}>
        {icon}
        {children}
        {onRemove ? (
          <button
            type="button"
            aria-label={removeLabel}
            onClick={onRemove}
            className="-mr-0.5 rounded-full p-0.5 transition-colors duration-150 hover:bg-black/10 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
          >
            <X size={11} strokeWidth={2.4} />
          </button>
        ) : null}
      </span>
    );
  }

  return (
    <span className={cn(filterChipClassName, toneClassName, className)}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
      >
        {icon}
        {children}
      </button>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="-mr-0.5 rounded-full p-0.5 transition-colors duration-150 hover:bg-black/10 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70"
        >
          <X size={11} strokeWidth={2.4} />
        </button>
      ) : null}
    </span>
  );
}
