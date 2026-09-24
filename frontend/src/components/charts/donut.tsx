import { useState } from "react";
import { cn } from "@/lib/utils";

/*
  Pulse donut. The public API is unchanged (`DonutDatum[]`, `size`,
  `thickness`, `centerLabel`, `centerValue`, `className`) so every existing
  call site keeps working — only the visual language changed: rounded caps,
  a real gap between segments, soft hover growth and a legend that stays in
  sync with the ring.
*/

export interface DonutDatum {
  readonly label: string;
  readonly value: number;
  readonly color: string;
}

interface DonutProperties {
  readonly data: DonutDatum[];
  readonly size?: number;
  readonly thickness?: number;
  readonly centerLabel?: string;
  readonly centerValue?: string | number;
  readonly className?: string;
}

export function Donut({
  data,
  size = 168,
  thickness = 16,
  centerLabel,
  centerValue,
  className,
}: DonutProperties) {
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  // One gap per segment keeps neighbouring arcs visually separated.
  const gap = data.length > 1 ? 3 : 0;
  const active = hover === null ? null : data.find((datum) => datum.label === hover);
  let offset = 0;

  return (
    <div className={cn("flex items-center gap-5", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgb(var(--elevated))"
            strokeWidth={thickness}
          />
          {data.map((datum) => {
            const fraction = total ? datum.value / total : 0;
            const length = fraction * circumference;
            const dash = Math.max(length - gap, 0.01);
            const dashOffset = -offset;
            offset += length;
            const isActive = hover === datum.label;
            const isDimmed = hover !== null && !isActive;
            return (
              <circle
                key={datum.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={datum.color}
                strokeWidth={isActive ? thickness + 4 : thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                className="draw-ring cursor-pointer transition-all duration-200"
                opacity={isDimmed ? 0.28 : 1}
                onMouseEnter={() => setHover(datum.label)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="tnum text-[26px] font-semibold leading-none tracking-[-0.03em] text-foreground">
            {active ? active.value : (centerValue ?? total)}
          </span>
          {active !== null || centerLabel !== undefined ? (
            <span className="mt-1.5 max-w-[96px] truncate text-[11px] font-medium leading-tight text-muted-foreground">
              {active ? active.label : centerLabel}
            </span>
          ) : null}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1">
        {data.map((datum) => (
          <li
            key={datum.label}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors",
              hover === datum.label ? "bg-elevated" : "hover:bg-elevated/70",
            )}
            onMouseEnter={() => setHover(datum.label)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ background: datum.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
              {datum.label}
            </span>
            <span className="tnum text-[12.5px] font-semibold text-foreground">
              {datum.value}
            </span>
            <span className="tnum w-9 text-right text-[11px] text-muted-foreground/70">
              {total ? Math.round((datum.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
