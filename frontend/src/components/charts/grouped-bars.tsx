import { useId, useState } from "react";
import { floatingPanelClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";

/*
  Pulse grouped bars. Same public API as before (`GroupedBarDatum[]`, `aLabel`,
  `bLabel`, `height`, `className`), new visual language: rounded tops, a soft
  vertical gradient per series, a baseline and a floating tooltip.
*/

export interface GroupedBarDatum {
  readonly d: string;
  readonly created: number;
  readonly resolved: number;
}

interface GroupedBarsProperties {
  readonly data: GroupedBarDatum[];
  readonly aLabel: string;
  readonly bLabel: string;
  readonly height?: number;
  readonly className?: string;
}

/** Series colours come from tokens, so both themes stay in sync. */
const SERIES_A_BACKGROUND =
  "linear-gradient(to top, rgb(var(--primary) / 0.72), rgb(var(--primary)))";
const SERIES_B_BACKGROUND =
  "linear-gradient(to top, rgb(var(--ok) / 0.72), rgb(var(--ok)))";

export function GroupedBars({
  data,
  aLabel,
  bLabel,
  height = 148,
  className,
}: GroupedBarsProperties) {
  const max = Math.max(
    ...data.map((item) => Math.max(item.created, item.resolved)),
    1,
  );
  const [hover, setHover] = useState<number | null>(null);
  const groupId = useId();

  return (
    <div className={className}>
      <div className="relative flex items-end gap-[5px]" style={{ height }}>
        {data.map((item, index) => (
          <div
            key={groupId + index}
            className="group relative flex h-full flex-1 items-end justify-center gap-[3px]"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className={cn(
                "bar-grow w-full max-w-[11px] rounded-t-[4px] transition-opacity duration-150",
                hover !== null && hover !== index && "opacity-30",
              )}
              style={{
                height: `${(item.created / max) * 100}%`,
                background: SERIES_A_BACKGROUND,
                animationDelay: `${index * 28}ms`,
              }}
            />
            <div
              className={cn(
                "bar-grow w-full max-w-[11px] rounded-t-[4px] transition-opacity duration-150",
                hover !== null && hover !== index && "opacity-30",
              )}
              style={{
                height: `${(item.resolved / max) * 100}%`,
                background: SERIES_B_BACKGROUND,
                animationDelay: `${index * 28 + 40}ms`,
              }}
            />
            {hover === index ? (
              <div
                className={cn(
                  floatingPanelClassName,
                  "pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap px-2.5 py-1.5 text-[11px] text-foreground",
                )}
              >
                <span className="tnum font-semibold">{item.d}</span>
                <span className="text-muted-foreground"> · </span>
                {aLabel} <span className="tnum font-medium">{item.created}</span>
                <span className="text-muted-foreground"> · </span>
                {bLabel} <span className="tnum font-medium">{item.resolved}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-border/60 pt-2.5 text-[10.5px] text-muted-foreground">
        <span className="tnum">{data[0]?.d}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: SERIES_A_BACKGROUND }} />{" "}
            {aLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: SERIES_B_BACKGROUND }} />{" "}
            {bLabel}
          </span>
        </div>
        <span className="tnum">{data[data.length - 1]?.d}</span>
      </div>
    </div>
  );
}
