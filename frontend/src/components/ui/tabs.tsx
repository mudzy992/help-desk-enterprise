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
            onClick={() => onChange(item.key)}
            className={cn(
              "relative flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 text-[12.5px] font-medium transition-colors duration-150",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "rounded-md border px-1 py-0 text-[10.5px] leading-[14px] tnum",
                  isActive
                    ? "border-primary/40 bg-primary/15 text-[#7FA8F5]"
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
