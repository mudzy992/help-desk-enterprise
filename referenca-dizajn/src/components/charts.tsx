import { useId, useState } from "react";
import { cn } from "../utils/cn";

/* ---------------------------------------------------------------- */
/* Donut — raspodjela po statusima                                   */
/* ---------------------------------------------------------------- */

export function Donut({
  data,
  size = 168,
  thickness = 15,
  centerLabel,
  centerValue,
  className,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
  className?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  const active = hover ? data.find((d) => d.label === hover) : null;

  return (
    <div className={cn("flex items-center gap-5", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1B2436" strokeWidth={thickness} />
          {data.map((d) => {
            const frac = total ? d.value / total : 0;
            const dash = frac * c;
            const offset = -acc * c;
            acc += frac;
            const dim = hover && hover !== d.label;
            return (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={hover === d.label ? thickness + 4 : thickness}
                strokeDasharray={`${Math.max(dash - 2, 0)} ${c}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
                className={cn("draw-ring transition-all duration-200 cursor-pointer", dim && "opacity-25")}
                onMouseEnter={() => setHover(d.label)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[26px] font-semibold tracking-tight text-text tnum leading-8">
            {active ? active.value : centerValue ?? total}
          </span>
          <span className="max-w-[100px] truncate text-[11px] text-muted">
            {active ? active.label : centerLabel ?? "ukupno"}
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d) => (
          <li
            key={d.label}
            className={cn(
              "flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors cursor-pointer",
              hover === d.label ? "bg-elevated" : "hover:bg-elevated/60"
            )}
            onMouseEnter={() => setHover(d.label)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="size-2 rounded-[3px] shrink-0" style={{ background: d.color }} />
            <span className="flex-1 truncate text-[12px] text-muted">{d.label}</span>
            <span className="text-[12px] font-medium text-text tnum">{d.value}</span>
            <span className="w-9 text-right text-[11px] text-muted/70 tnum">
              {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Grupisani stubići — kreirani vs riješeni                          */
/* ---------------------------------------------------------------- */

export function GroupedBars({
  data,
  aLabel,
  bLabel,
  height = 148,
  className,
}: {
  data: { d: string; created: number; resolved: number }[];
  aLabel: string;
  bLabel: string;
  height?: number;
  className?: string;
}) {
  const max = Math.max(...data.map((x) => Math.max(x.created, x.resolved)), 1);
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();

  return (
    <div className={className}>
      <div className="flex items-end gap-[5px]" style={{ height }}>
        {data.map((x, i) => (
          <div
            key={gid + i}
            className="group relative flex h-full flex-1 items-end justify-center gap-[3px]"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className={cn(
                "w-full max-w-[11px] rounded-t-[3px] bg-primary transition-all duration-150 bar-grow",
                hover !== null && hover !== i && "opacity-35"
              )}
              style={{ height: `${(x.created / max) * 100}%`, animationDelay: `${i * 28}ms` }}
            />
            <div
              className={cn(
                "w-full max-w-[11px] rounded-t-[3px] bg-[#3B4A6B] transition-all duration-150 bar-grow",
                hover !== null && hover !== i && "opacity-35"
              )}
              style={{ height: `${(x.resolved / max) * 100}%`, animationDelay: `${i * 28 + 40}ms` }}
            />
            {hover === i && (
              <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-elevated px-2 py-1 text-[11px] text-text shadow-lg">
                <span className="font-medium tnum">{x.d}</span>
                <span className="text-muted"> · </span>kreirano <span className="tnum">{x.created}</span>
                <span className="text-muted"> · </span>riješeno <span className="tnum">{x.resolved}</span>
              </div>
            )}
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

/* ---------------------------------------------------------------- */
/* Horizontalne trake — opterećenje grupa / usluge                   */
/* ---------------------------------------------------------------- */

export function HBars({
  items,
  className,
}: {
  items: { label: string; value: number; color?: string; suffix?: string }[];
  className?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className={cn("space-y-2.5", className)}>
      {items.map((it, i) => (
        <li key={i} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
            <span className="truncate text-muted group-hover:text-text transition-colors">{it.label}</span>
            <span className="shrink-0 font-medium text-text tnum">
              {it.value}
              {it.suffix && <span className="ml-0.5 text-[11px] font-normal text-muted/70">{it.suffix}</span>}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? "#2563EB" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
