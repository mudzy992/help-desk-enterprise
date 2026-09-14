import { useState } from "react";
import { cn } from "@/lib/utils";

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
  thickness = 15,
  centerLabel,
  centerValue,
  className,
}: DonutProperties) {
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;
  const active = hover ? data.find((datum) => datum.label === hover) : null;

  return (
    <div className={cn("flex items-center gap-5", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1B2436"
            strokeWidth={thickness}
          />
          {data.map((datum) => {
            const fraction = total ? datum.value / total : 0;
            const dash = fraction * circumference;
            const offset = -accumulated * circumference;
            accumulated += fraction;
            const dimmed = hover && hover !== datum.label;
            return (
              <circle
                key={datum.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={datum.color}
                strokeWidth={hover === datum.label ? thickness + 4 : thickness}
                strokeDasharray={`${Math.max(dash - 2, 0)} ${circumference}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                className={cn(
                  "draw-ring cursor-pointer transition-all duration-200",
                  dimmed && "opacity-25",
                )}
                onMouseEnter={() => setHover(datum.label)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="tnum text-[26px] font-semibold leading-8 tracking-tight text-text">
            {active ? active.value : (centerValue ?? total)}
          </span>
          <span className="max-w-[100px] truncate text-[11px] text-muted">
            {active ? active.label : (centerLabel ?? "ukupno")}
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((datum) => (
          <li
            key={datum.label}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors",
              hover === datum.label ? "bg-elevated" : "hover:bg-elevated/60",
            )}
            onMouseEnter={() => setHover(datum.label)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              className="size-2 shrink-0 rounded-[3px]"
              style={{ background: datum.color }}
            />
            <span className="flex-1 truncate text-[12px] text-muted">{datum.label}</span>
            <span className="tnum text-[12px] font-medium text-text">{datum.value}</span>
            <span className="tnum w-9 text-right text-[11px] text-muted/70">
              {total ? Math.round((datum.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
