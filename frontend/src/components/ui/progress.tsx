import { pulseToneStyles } from "@/components/ui/tone-styles";
import type { BadgeTone } from "@/lib/ui/presentation-types";
import { cn } from "@/lib/utils";

interface ProgressProperties {
  readonly value: number;
  readonly tone?: BadgeTone;
  readonly className?: string;
  readonly ariaLabel?: string;
}

export function Progress({ value, tone = "primary", className, ariaLabel }: ProgressProperties) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-border/60", className)}
    >
      <div
        aria-hidden="true"
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          pulseToneStyles[tone].fill,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
