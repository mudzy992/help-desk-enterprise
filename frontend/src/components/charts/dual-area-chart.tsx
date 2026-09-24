import { useId, useState } from "react";
import { floatingPanelClassName } from "@/components/ui/control";
import {
  buildAreaPath,
  buildLinePath,
  plotX,
  resolvePlotMax,
  type PlotSize,
} from "@/lib/charts/plot-geometry";
import { cn } from "@/lib/utils";

/*
  Pulse dual area chart — the signature chart of the new identity: two series
  as soft gradient areas with a thin highlighted stroke, dashed reference
  lines and a hover column with a floating readout.

  Pure SVG, no charting library. Both series come from tokens, so the chart
  follows the active theme (`classic` included) without any prop changes.
*/

export interface DualAreaPoint {
  readonly label: string;
  /** First series — drawn in `--primary`. */
  readonly a: number;
  /** Second series — drawn in `--ok` (resolved / good outcome). */
  readonly b: number;
}

interface DualAreaChartProperties {
  readonly data: readonly DualAreaPoint[];
  /** Rendered height in pixels; the viewBox is fixed. */
  readonly height?: number;
  readonly aLabel: string;
  readonly bLabel: string;
  readonly className?: string;
}

const SIZE: PlotSize = {
  width: 1000,
  height: 260,
  padding: { top: 16, right: 12, bottom: 26, left: 30 },
};
const GRID = [0, 0.25, 0.5, 0.75, 1] as const;

const STROKE_A = "rgb(var(--primary))";
const STROKE_B = "rgb(var(--ok))";

export function DualAreaChart({
  data,
  height = 200,
  aLabel,
  bLabel,
  className,
}: DualAreaChartProperties) {
  // SVG ids must not contain the colons React's useId emits.
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return null;
  }

  const activePoint = hover === null ? null : (data[hover] ?? null);
  const baselineY = SIZE.padding.top + (SIZE.height - SIZE.padding.top - SIZE.padding.bottom);
  const max = resolvePlotMax(data.flatMap((point) => [point.a, point.b]));
  const step =
    data.length > 1
      ? (SIZE.width - SIZE.padding.left - SIZE.padding.right) / (data.length - 1)
      : 0;

  const series = (key: "a" | "b") => data.map((point) => point[key]);
  const line = (key: "a" | "b") => buildLinePath(series(key), max, SIZE);
  const area = (key: "a" | "b") => buildAreaPath(series(key), max, SIZE);
  const x = (index: number) => plotX(index, data.length, SIZE);

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
          <span className="h-2 w-4 rounded-full" style={{ background: STROKE_A }} />
          {aLabel}
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
          <span className="h-2 w-4 rounded-full" style={{ background: STROKE_B }} />
          {bLabel}
        </span>
      </div>

      <div className="relative" style={{ height }}>
        <svg
          viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
          className="h-full w-full"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`da-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={STROKE_A} stopOpacity="0.26" />
              <stop offset="100%" stopColor={STROKE_A} stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id={`db-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={STROKE_B} stopOpacity="0.22" />
              <stop offset="100%" stopColor={STROKE_B} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {GRID.map((ratio) => (
            <line
              key={ratio}
              x1={SIZE.padding.left}
              x2={SIZE.width - SIZE.padding.right}
              y1={SIZE.padding.top + (baselineY - SIZE.padding.top) * ratio}
              y2={SIZE.padding.top + (baselineY - SIZE.padding.top) * ratio}
              stroke="rgb(var(--border))"
              strokeWidth="1"
              strokeDasharray={ratio === 1 ? "0" : "3 6"}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area("a")} fill={`url(#da-${uid})`} />
          <path d={area("b")} fill={`url(#db-${uid})`} />

          {(["b", "a"] as const).map((key) => (
            <path
              key={key}
              d={line(key)}
              fill="none"
              stroke={key === "a" ? STROKE_A : STROKE_B}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {hover !== null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={SIZE.padding.top}
              y2={baselineY}
              stroke="rgb(var(--line-strong))"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {data.map((point, index) => (
            <rect
              key={`${point.label}-${index}`}
              x={x(index) - step / 2}
              y={SIZE.padding.top}
              width={step || SIZE.width - SIZE.padding.left - SIZE.padding.right}
              height={baselineY - SIZE.padding.top}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-[3%] text-[10.5px] font-medium text-muted-foreground/70">
          {data.map((point, index) => (
            <span
              key={`${point.label}-${index}`}
              className={cn("tnum", index % 2 === 1 && "hidden sm:inline")}
            >
              {point.label}
            </span>
          ))}
        </div>

        {activePoint !== null ? (
          <div
            className={cn(
              floatingPanelClassName,
              "pointer-events-none absolute top-1 z-10 w-36 p-2.5",
            )}
            style={{
              left: `min(max(${((hover ?? 0) / Math.max(data.length - 1, 1)) * 100}%, 0px), calc(100% - 144px))`,
            }}
          >
            <p className="text-[11px] font-semibold text-foreground">
              {activePoint.label}
            </p>
            <p className="mt-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
              {aLabel}
              <span className="tnum font-semibold text-foreground">
                {activePoint.a}
              </span>
            </p>
            <p className="flex items-center justify-between text-[11.5px] text-muted-foreground">
              {bLabel}
              <span className="tnum font-semibold text-ok">{activePoint.b}</span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
