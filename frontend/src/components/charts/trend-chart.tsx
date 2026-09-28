import { useState } from "react";
import { floatingPanelClassName } from "@/components/ui/control";
import { cn } from "@/lib/utils";

/*
  Paket 2.5 (design §7.2): multi-series trend chart — lines and/or bars over
  the same buckets, an optional dashed target line, the current (partial)
  bucket drawn dashed and low-sample points hollow. Pure SVG, colours from
  tokens only, so it follows every palette and the light print theme.
*/

export type TrendSeriesTone = "primary" | "ok" | "warning" | "danger" | "info" | "muted";

export interface TrendSeries {
  readonly key: string;
  readonly label: string;
  readonly kind: "line" | "bar";
  readonly tone: TrendSeriesTone;
  /** `null` = no data for the bucket (gap in the line, no bar). */
  readonly values: readonly (number | null)[];
  readonly format: (value: number) => string;
  /** Per-bucket „few samples” flag — the point is drawn hollow. */
  readonly lowSample?: readonly boolean[];
}

interface TrendChartProperties {
  readonly labels: readonly string[];
  readonly tooltipLabels: readonly string[];
  readonly series: readonly TrendSeries[];
  /** The last bucket is still running. */
  readonly partialLast?: boolean;
  readonly target?: { readonly value: number; readonly label: string };
  /** Fixed top of the axis (100 for percentages). */
  readonly yMax?: number;
  readonly height?: number;
  readonly partialLabel?: string;
  readonly lowSampleLabel?: string;
  readonly className?: string;
  readonly testId?: string;
}

const W = 1000;
const H = 260;
const PAD = { top: 14, right: 14, bottom: 8, left: 14 };
const GRID = [0, 0.25, 0.5, 0.75, 1] as const;

const toneColor: Record<TrendSeriesTone, string> = {
  primary: "rgb(var(--primary))",
  ok: "rgb(var(--ok))",
  warning: "rgb(var(--warning))",
  danger: "rgb(var(--danger))",
  info: "rgb(var(--info))",
  muted: "rgb(var(--muted))",
};

const toneText: Record<TrendSeriesTone, string> = {
  primary: "text-link",
  ok: "text-ok",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
  muted: "text-muted-foreground",
};

export function TrendChart({
  labels,
  tooltipLabels,
  series,
  partialLast = false,
  target,
  yMax,
  height = 200,
  partialLabel,
  lowSampleLabel,
  className,
  testId,
}: TrendChartProperties) {
  const [hover, setHover] = useState<number | null>(null);
  const count = labels.length;
  if (count === 0) return null;

  const values = series.flatMap((item) => item.values.filter((value): value is number => value !== null));
  const rawMax = Math.max(0, ...values, target?.value ?? 0);
  const rawMin = Math.min(0, ...values);
  const top = yMax ?? (rawMax > 0 ? rawMax * 1.15 : 1);
  const bottom = rawMin < 0 ? rawMin * 1.15 : 0;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / count;
  const x = (index: number) => PAD.left + slot * index + slot / 2;
  const y = (value: number) => PAD.top + innerH - ((value - bottom) / (top - bottom || 1)) * innerH;
  const zeroY = y(0);
  const bars = series.filter((item) => item.kind === "bar");
  const barWidth = Math.min(28, (slot * 0.7) / Math.max(bars.length, 1));

  const linePath = (item: TrendSeries, from: number, to: number) => {
    let path = "";
    let pen = false;
    for (let index = from; index <= to; index += 1) {
      const value = item.values[index] ?? null;
      if (value === null) {
        pen = false;
        continue;
      }
      path += `${pen ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)} `;
      pen = true;
    }
    return path.trim();
  };

  const solidEnd = partialLast && count > 1 ? count - 2 : count - 1;

  return (
    <div className={cn("w-full", className)} data-testid={testId}>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((item) => (
          <span key={item.key} className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
            <span
              className={cn(item.kind === "bar" ? "h-2.5 w-2.5 rounded-sm" : "h-0.5 w-4 rounded-full")}
              style={{ background: toneColor[item.tone] }}
            />
            {item.label}
          </span>
        ))}
        {target !== undefined ? (
          <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
            <span className="w-4 border-t border-dashed border-danger" />
            {target.label}
          </span>
        ) : null}
        {partialLast && partialLabel !== undefined ? (
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span className="w-4 border-t-2 border-dotted border-muted-foreground" />
            {partialLabel}
          </span>
        ) : null}
        {lowSampleLabel !== undefined && series.some((item) => item.lowSample?.some(Boolean)) ? (
          <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span className="h-2 w-2 rounded-full border border-muted-foreground" />
            {lowSampleLabel}
          </span>
        ) : null}
      </div>

      <div className="relative" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" role="img">
          {GRID.map((ratio) => (
            <line
              key={ratio}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + innerH * ratio}
              y2={PAD.top + innerH * ratio}
              stroke="rgb(var(--border))"
              strokeWidth="1"
              strokeDasharray="3 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={zeroY}
            y2={zeroY}
            stroke="rgb(var(--line-strong))"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {partialLast ? (
            <rect
              x={PAD.left + slot * (count - 1)}
              y={PAD.top}
              width={slot}
              height={innerH}
              fill="rgb(var(--muted) / 0.08)"
            />
          ) : null}

          {bars.map((item, barIndex) =>
            item.values.map((value, index) => {
              if (value === null) return null;
              const left = x(index) - (barWidth * bars.length) / 2 + barWidth * barIndex;
              const y1 = Math.min(y(value), zeroY);
              return (
                <rect
                  key={`${item.key}-${index}`}
                  x={left}
                  y={y1}
                  width={barWidth * 0.86}
                  height={Math.max(Math.abs(zeroY - y(value)), value === 0 ? 0 : 1)}
                  rx="2"
                  fill={toneColor[item.tone]}
                  fillOpacity={partialLast && index === count - 1 ? 0.35 : 0.7}
                />
              );
            }),
          )}

          {target !== undefined ? (
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(target.value)}
              y2={y(target.value)}
              stroke="rgb(var(--danger))"
              strokeWidth="1.4"
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {series
            .filter((item) => item.kind === "line")
            .map((item) => (
              <g key={item.key}>
                <path
                  d={linePath(item, 0, solidEnd)}
                  fill="none"
                  stroke={toneColor[item.tone]}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {partialLast && count > 1 ? (
                  <path
                    d={linePath(item, count - 2, count - 1)}
                    fill="none"
                    stroke={toneColor[item.tone]}
                    strokeWidth="2"
                    strokeDasharray="2 5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </g>
            ))}

          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="rgb(var(--line-strong))"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {labels.map((label, index) => (
            <rect
              key={`${label}-${index}`}
              x={PAD.left + slot * index}
              y={PAD.top}
              width={slot}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>

        {/* Points as HTML so they stay round with preserveAspectRatio="none". */}
        <div className="pointer-events-none absolute inset-0">
          {series
            .filter((item) => item.kind === "line")
            .flatMap((item) =>
              item.values.map((value, index) =>
                value === null || (count > 40 && hover !== index) ? null : (
                  <span
                    key={`${item.key}-${index}`}
                    className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                    style={{
                      left: `${(x(index) / W) * 100}%`,
                      top: `${(y(value) / H) * 100}%`,
                      borderColor: toneColor[item.tone],
                      background: item.lowSample?.[index] === true ? "rgb(var(--surface))" : toneColor[item.tone],
                      opacity: item.lowSample?.[index] === true ? 0.7 : 1,
                    }}
                  />
                ),
              ),
            )}
        </div>

        {hover !== null ? (
          <div
            className={cn(floatingPanelClassName, "pointer-events-none absolute top-1 z-10 w-48 p-2.5")}
            style={{ left: `min(max(calc(${(x(hover) / W) * 100}% - 96px), 0px), calc(100% - 192px))` }}
          >
            <p className="text-[11px] font-semibold text-foreground">
              {tooltipLabels[hover] ?? labels[hover]}
              {partialLast && hover === count - 1 && partialLabel !== undefined ? (
                <span className="ml-1 font-normal text-muted-foreground">· {partialLabel}</span>
              ) : null}
            </p>
            {series.map((item) => {
              const value = item.values[hover] ?? null;
              return (
                <p
                  key={item.key}
                  className="mt-0.5 flex items-center justify-between gap-2 text-[11.5px] text-muted-foreground"
                >
                  <span className="truncate">{item.label}</span>
                  <span className={cn("tnum font-semibold", toneText[item.tone])}>
                    {value === null ? "—" : item.format(value)}
                    {item.lowSample?.[hover] === true ? " *" : ""}
                  </span>
                </p>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-1 flex text-[10.5px] font-medium text-muted-foreground/80">
        {labels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className="tnum flex-1 truncate text-center"
            style={{ visibility: index % Math.ceil(count / 12) === 0 ? "visible" : "hidden" }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
