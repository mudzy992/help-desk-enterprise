import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type UnderlineTabItem = {
  readonly key: string;
  readonly label: ReactNode;
  readonly count?: number;
};

interface UnderlineTabsProperties {
  readonly items: readonly UnderlineTabItem[];
  readonly active: string;
  readonly onChange: (key: string) => void;
  readonly className?: string;
}

export function UnderlineTabs({
  items,
  active,
  onChange,
  className,
}: UnderlineTabsProperties) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-center gap-1 overflow-x-auto border-b border-border/70",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            data-testid={`tab-${item.key}`}
            aria-selected={isActive}
            onClick={() => onChange(item.key)}
            className={cn(
              "relative flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
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
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
