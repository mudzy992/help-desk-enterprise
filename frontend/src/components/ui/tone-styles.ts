import type { BadgeTone } from "@/lib/ui/presentation-types";

type PulseToneStyle = {
  readonly badge: string;
  readonly text: string;
  readonly fill: string;
};

/** One exhaustive semantic-tone mapping shared by badges, metric deltas and progress fills. */
export const pulseToneStyles: Readonly<Record<BadgeTone, PulseToneStyle>> = {
  neutral: {
    badge: "border-border bg-elevated/70 text-muted-foreground",
    text: "text-muted-foreground",
    fill: "bg-muted",
  },
  primary: {
    badge: "border-primary/35 bg-primary/12 text-foreground",
    text: "text-link",
    fill: "bg-primary",
  },
  accent: {
    badge: "border-accent/25 bg-accent/10 text-accent",
    text: "text-accent",
    fill: "bg-accent",
  },
  success: {
    badge: "border-success/30 bg-success/10 text-ok",
    text: "text-ok",
    fill: "bg-success",
  },
  warning: {
    badge: "border-warning/30 bg-warning/10 text-warning",
    text: "text-warning",
    fill: "bg-warning",
  },
  danger: {
    badge: "border-danger/30 bg-danger/10 text-danger",
    text: "text-danger",
    fill: "bg-danger",
  },
  info: {
    badge: "border-info/30 bg-info/10 text-info",
    text: "text-info",
    fill: "bg-info",
  },
  hold: {
    badge: "border-hold/30 bg-hold/10 text-hold",
    text: "text-hold",
    fill: "bg-hold",
  },
};
