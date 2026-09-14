import { useId, useState } from "react";
import { cn } from "@/lib/utils";

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

export function GroupedBars({
  data,
  aLabel,
  bLabel,
  height = 148,
  className,
}: GroupedBarsProperties) {
  const max = Math.max(...data.map((item) => Math.max(item.created, item.resolved)), 1);
  const [hover, setHover] = useState<number | null>(null);
  const groupId = useId();

  return (
    <div className={className}>
      <div className="flex items-end gap-[5px]" style={{ height }}>
        {data.map((item, index) => (
          <div
            key={groupId + index}
            className="group relative flex h-full flex-1 items-end justify-center gap-[3px]"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className={cn(
                "bar-grow w-full max-w-[11px] rounded-t-[3px] bg-primary transition-all duration-150",
                hover !== null && hover !== index && "opacity-35",
              )}
              style={{
                height: `${(item.created / max) * 100}%`,
                animationDelay: `${index * 28}ms`,
              }}
            />
            <div
              className={cn(
                "bar-grow w-full max-w-[11px] rounded-t-[3px] bg-[#3B4A6B] transition-all duration-150",
                hover !== null && hover !== index && "opacity-35",
              )}
              style={{
                height: `${(item.resolved / max) * 100}%`,
                animationDelay: `${index * 28 + 40}ms`,
              }}
            />
            {hover === index ? (
              <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-elevated px-2 py-1 text-[11px] text-text shadow-xl shadow-black/40">
                <span className="tnum font-medium">{item.d}</span>
                <span className="text-muted"> · </span>
                {aLabel} <span className="tnum">{item.created}</span>
                <span className="text-muted"> · </span>
                {bLabel} <span className="tnum">{item.resolved}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10.5px] text-muted/70">
        <span>{data[0]?.d}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[3px] bg-primary" /> {aLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[3px] bg-[#3B4A6B]" /> {bLabel}
          </span>
        </div>
        <span>{data[data.length - 1]?.d}</span>
      </div>
    </div>
  );
}
