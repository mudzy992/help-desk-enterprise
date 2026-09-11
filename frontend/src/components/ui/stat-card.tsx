import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProperties {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  readonly icon?: ReactNode;
  readonly emphasis?: boolean;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  emphasis = false,
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
      </div>
      {hint ? (
        <p className="mt-0.5 text-[11.5px] leading-4 text-muted-foreground/80">{hint}</p>
      ) : null}
    </Card>
  );
}
