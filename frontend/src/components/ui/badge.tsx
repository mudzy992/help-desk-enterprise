import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-elevated/70 text-muted border-border",
  primary: "bg-primary/15 text-[#7FA8F5] border-primary/35",
  accent: "bg-accent/10 text-accent border-accent/30",
  success: "bg-success/10 text-[#4ADE80] border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-danger/10 text-danger border-danger/35",
  info: "bg-info/10 text-info border-info/30",
};

interface BadgeProperties {
  readonly tone?: BadgeTone;
  readonly dot?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: BadgeProperties) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export type MetaBadgeMeta = {
  readonly label: string;
  readonly tone: BadgeTone;
};

interface MetaBadgeProperties {
  readonly meta: MetaBadgeMeta;
  readonly className?: string;
  readonly dot?: boolean;
}

export function MetaBadge({
  meta,
  className,
  dot = true,
}: MetaBadgeProperties) {
  return (
    <Badge tone={meta.tone} className={className} dot={dot}>
      {meta.label}
    </Badge>
  );
}
