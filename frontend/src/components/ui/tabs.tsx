import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { nextSelectionIndex } from "@/components/ui/selection-keyboard";
import { cn } from "@/lib/utils";

export type UnderlineTabItem = {
  readonly key: string;
  readonly label: ReactNode;
  readonly count?: number;
  readonly panelId?: string;
};

interface UnderlineTabsProperties {
  readonly items: readonly UnderlineTabItem[];
  readonly active: string;
  readonly onChange: (key: string) => void;
  readonly className?: string;
  readonly label?: string;
}

export function UnderlineTabs({
  items,
  active,
  onChange,
  className,
  label,
}: UnderlineTabsProperties) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = nextSelectionIndex(event.key, index, items.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const item = items[nextIndex];
    if (item === undefined) return;
    onChange(item.key);
    buttons.current[nextIndex]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={cn("flex items-center gap-1 overflow-x-auto border-b border-border/70", className)}
    >
      {items.map((item, index) => {
        const isActive = active === item.key;
        return (
          <button
            ref={(element) => {
              buttons.current[index] = element;
            }}
            key={item.key}
            id={`tab-${item.key}`}
            type="button"
            role="tab"
            tabIndex={isActive ? 0 : -1}
            data-testid={`tab-${item.key}`}
            aria-selected={isActive}
            aria-controls={item.panelId}
            onKeyDown={(event) => selectFromKeyboard(event, index)}
            onClick={() => onChange(item.key)}
            className={cn(
              "relative flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "tnum rounded-full border px-1.5 py-0 text-[10.5px] leading-[15px]",
                  isActive
                    ? "border-primary/25 bg-primary/10 text-link"
                    : "border-border bg-elevated/70 text-muted-foreground",
                )}
              >
                {item.count}
              </span>
            ) : null}
            {isActive ? (
              <span
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
