import type { ReactNode } from "react";
import type { BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STAT_DELTA_TONES: Record<BadgeTone, string> = {
  neutral: "text-muted-foreground",
  primary: "text-[#7FA8F5]",
  accent: "text-accent",
  success: "text-[#4ADE80]",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

interface StatCardProperties {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  readonly icon?: ReactNode;
  readonly emphasis?: boolean;
  readonly delta?: string;
  readonly deltaTone?: BadgeTone;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  emphasis = false,
  delta,
  deltaTone = "neutral",
}: StatCardProperties) {
  return (
    <Card className="h-full px-4 py-3.5 transition-colors duration-150 hover:border-[#31405C]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
          {label}
        </span>
        {icon ? <span className="text-muted-foreground/60">{icon}</span> : null}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span
          className={cn(
            "tnum text-[24px] font-semibold leading-7 tracking-tight",
            emphasis ? "text-danger" : "text-foreground",
          )}
        >
          {value}
        </span>
        {delta ? (
          <span className={cn("tnum text-[11.5px] font-medium", STAT_DELTA_TONES[deltaTone])}>
            {delta}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground/80">{hint}</p>
      ) : null}
    </Card>
  );
}
