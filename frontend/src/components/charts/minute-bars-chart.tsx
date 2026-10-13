import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartDataTable } from "@/components/charts/chart-data-table";
import { describeChart } from "@/lib/charts/chart-summary";
import {
  axisTickIndexes,
  barHeightPercent,
  minuteBarsMax,
  seriesPeak,
} from "@/lib/charts/minute-series";
import { cn } from "@/lib/utils";

/*
  Minute bar strip — the chart for "one count per minute over the last hour".

  The dual area chart is the right shape for a handful of daily buckets; with 60
  minute buckets it is not. The area gets so dense that a single 429 spike is a
  needle, and the 60 x-axis labels it renders (one per point, `justify-between`)
  are wider than any card — that is what pushed the security metrics card out of
  its surface on the live stack and gave the whole page a horizontal scrollbar.

  This component draws the same data as two thin strips of bars, one per series,
  sharing one scale:

    * a bar per minute is honest about count data ("3 blocked sign-ins in this
      minute" is a column, not an area);
    * every bar is `flex-1 min-w-0`, so the strip can never be wider than its
      card, at any number of buckets or any window width;
    * the axis carries a handful of evenly spread ticks (`axisTickIndexes`);
    * hovering a bar writes the exact minute into a readout line with a reserved
      height — no floating panel, no layout shift, nothing that can escape the
      card.

  Pure SVG-free markup, tokens only, and the same "Show as table" alternative
  every other chart has (2.8 §3.6).
*/

export interface MinuteBarsPoint {
  readonly label: string;
  /** Counts of the first series for that minute — drawn in `--primary`. */
  readonly a: number;
  /** Counts of the second series for that minute — drawn in `--ok`. */
  readonly b: number;
}

interface MinuteBarsChartProperties {
  readonly data: readonly MinuteBarsPoint[];
  /** Height of one strip in pixels; two strips are drawn. */
  readonly height?: number;
  readonly aLabel: string;
  readonly bLabel: string;
  readonly className?: string;
}

const stripTones = {
  a: { bar: "bg-primary/65", barActive: "bg-primary", legend: "bg-primary" },
  b: { bar: "bg-ok/60", barActive: "bg-ok", legend: "bg-ok" },
} as const;

export function MinuteBarsChart({
  data,
  height = 56,
  aLabel,
  bLabel,
  className,
}: MinuteBarsChartProperties) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return null;
  }

  const max = minuteBarsMax(data);
  const ticks = axisTickIndexes(data.length);
  const active = hover === null ? null : (data[hover] ?? null);
  const series = (key: "a" | "b") => data.map((point) => point[key]);

  const strip = (key: "a" | "b", label: string) => (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[11px] font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2 w-3 rounded-sm", stripTones[key].legend)} />
          {label}
        </span>
        <span className="tnum">
          {t("a11y.chart.seriesPeak", { value: seriesPeak(series(key)) })}
        </span>
      </div>
      <div className="mt-1 flex items-end gap-px" style={{ height }}>
        {data.map((point, index) => (
          <div
            key={`${key}-${point.label}-${index}`}
            className="flex h-full min-w-0 flex-1 items-end"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              className={cn(
                "w-full rounded-t-[2px]",
                hover === index ? stripTones[key].barActive : stripTones[key].bar,
              )}
              style={{ height: point[key] > 0 ? `${barHeightPercent(point[key], max)}%` : "2px" }}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={cn("min-w-0", className)}>
      <div
        role="img"
        aria-label={describeChart(
          t,
          [
            { label: aLabel, values: series("a") },
            { label: bLabel, values: series("b") },
          ],
          data.map((point) => point.label),
        )}
      >
        <div className="grid gap-1.5">
          {strip("a", aLabel)}
          {strip("b", bLabel)}
        </div>
        <div className="mt-1 flex justify-between gap-2 px-0.5 text-[10.5px] font-medium text-muted-foreground">
          {ticks.map((index) => (
            <span key={index} className="tnum whitespace-nowrap">
              {data[index]?.label}
            </span>
          ))}
        </div>
      </div>
      <p className="tnum mt-1 min-h-[16px] text-[11px] text-muted-foreground">
        {active === null
          ? t("a11y.chart.barsHint")
          : `${active.label} · ${aLabel} ${active.a} · ${bLabel} ${active.b}`}
      </p>
      <ChartDataTable
        caption={`${aLabel}, ${bLabel}`}
        bucketLabels={data.map((point) => point.label)}
        columns={[
          { key: "a", label: aLabel, values: series("a") },
          { key: "b", label: bLabel, values: series("b") },
        ]}
      />
    </div>
  );
}
