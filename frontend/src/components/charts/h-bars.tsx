import { cn } from "@/lib/utils";

/*
  Pulse horizontal bars. Same public API as before (`HorizontalBarItem[]` with
  an optional per-item `color` and `suffix`), new visual language: a calmer
  track, a rounded gradient fill and typography that puts the number first.
*/

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

const DEFAULT_FILL =
  "linear-gradient(to right, rgb(var(--primary) / 0.78), rgb(var(--primary)))";

export function HBars({ items, className }: HorizontalBarsProperties) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="group">
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[12px]">
            <span className="truncate text-muted-foreground transition-colors group-hover:text-foreground">
              {item.label}
            </span>
            <span className="tnum shrink-0 font-semibold text-foreground">
              {item.value}
              {item.suffix ? (
                <span className="ml-1 text-[11px] font-normal text-muted-foreground/70">
                  {item.suffix}
                </span>
              ) : null}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: item.color ?? DEFAULT_FILL,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
