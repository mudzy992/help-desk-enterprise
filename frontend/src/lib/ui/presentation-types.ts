/** Shared presentation contracts used by view-models and Pulse components. */
export type BadgeTone =
  "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info" | "hold";

export interface HorizontalBarItem {
  readonly label: string;
  readonly value: number;
  readonly color?: string;
  readonly suffix?: string;
}

export type GroupDrawerTab = "edit" | "members";
