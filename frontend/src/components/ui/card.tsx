import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
  Cards sit on the canvas, not on it: a hairline border plus the theme's
  `shadow-card` (which is `none` on the legacy dark theme, and a whisper-soft
  1px lift on the light canvas). Radius comes from `rounded-lg`, which resolves
  to 12px in Pulse and 8px in classic.
*/
export function Card({ className, ...properties }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface shadow-card",
        className,
      )}
      {...properties}
    />
  );
}

interface CardHeaderProperties {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: CardHeaderProperties) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 pb-3 pt-3.5",
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-[13.5px] font-semibold leading-5 text-foreground">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
