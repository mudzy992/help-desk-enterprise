import { cn } from "@/lib/utils";

export interface HorizontalBarItem {
  readonly label: string;
  readonly value: number;
  readonly color?: string;
  readonly suffix?: string;
}

interface HorizontalBarsProperties {
  readonly items: HorizontalBarItem[];
  readonly className?: string;
}

export function HBars({ items, className }: HorizontalBarsProperties) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
            <span className="truncate text-muted transition-colors group-hover:text-text">
              {item.label}
            </span>
            <span className="tnum shrink-0 font-medium text-text">
              {item.value}
              {item.suffix ? (
                <span className="ml-1 text-[11px] font-normal text-muted/70">
                  {item.suffix}
                </span>
              ) : null}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: item.color ?? "#2563EB",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
