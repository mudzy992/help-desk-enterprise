import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/ui/presentation-types";

const PROGRESS_TONES: Record<BadgeTone, string> = {
  neutral: "bg-muted",
  primary: "bg-primary",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  hold: "bg-hold",
};

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
        className={cn("h-full rounded-full transition-[width] duration-500", PROGRESS_TONES[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
