import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "hold";

/*
  One badge shape for the whole application: a pill with a tinted background,
  a hairline border and a text colour that is contrast-checked per theme.
  `hold` is new — it carries approval / confidential semantics that previously
  had no colour of its own.
*/
const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-border bg-elevated/70 text-muted-foreground",
  primary: "border-primary/25 bg-primary/10 text-link",
  accent: "border-accent/25 bg-accent/10 text-accent",
  success: "border-success/30 bg-success/10 text-ok",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-info/30 bg-info/10 text-info",
  hold: "border-hold/30 bg-hold/10 text-hold",
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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
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
