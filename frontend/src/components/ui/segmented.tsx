import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { nextSelectionIndex } from "@/components/ui/selection-keyboard";
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
  readonly size?: "sm" | "md";
  readonly ariaLabel?: string;
  readonly className?: string;
}

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  size = "md",
  ariaLabel,
  className,
}: SegmentedProperties<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = nextSelectionIndex(event.key, index, items.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const item = items[nextIndex];
    if (item === undefined) return;
    onChange(item.value);
    buttons.current[nextIndex]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-surface-hover p-0.5",
        className,
      )}
    >
      {items.map((item, index) => {
        const isActive = item.value === value;
        return (
          <button
            ref={(element) => {
              buttons.current[index] = element;
            }}
            key={item.value}
            type="button"
            role="radio"
            tabIndex={isActive ? 0 : -1}
            aria-checked={isActive}
            onKeyDown={(event) => selectFromKeyboard(event, index)}
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
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
