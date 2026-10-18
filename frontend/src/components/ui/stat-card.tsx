import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { pulseToneStyles } from "@/components/ui/tone-styles";
import type { BadgeTone } from "@/lib/ui/presentation-types";
import { cn } from "@/lib/utils";

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
    <Card className="h-full px-4 py-3.5 transition-colors duration-150 hover:border-line-strong">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
          {label}
        </span>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
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
          <span className={cn("tnum text-[11.5px] font-medium", pulseToneStyles[deltaTone].text)}>
            {delta}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
