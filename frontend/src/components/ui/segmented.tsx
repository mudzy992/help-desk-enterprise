import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentedItem<T extends string> = {
  readonly value: T;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
};

interface SegmentedProperties<T extends string> {
  readonly items: readonly SegmentedItem<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** `sm` for toolbars, `md` for page-level switches. */
  readonly size?: "sm" | "md";
  readonly ariaLabel?: string;
  readonly className?: string;
}

/**
 * Two-to-four mutually exclusive options rendered as a single control —
 * the Pulse replacement for a pair of toggle buttons or a cramped `<select>`.
 */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  size = "md",
  ariaLabel,
  className,
}: SegmentedProperties<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-hover p-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-primary/70",
              size === "sm" ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12px]",
              isActive
                ? "bg-surface text-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
