import type { WeeklyHours } from "@/services/sla-types";

export const slaWeekdays = [
  { key: "1", labelKey: "sla.weekdayMonday" },
  { key: "2", labelKey: "sla.weekdayTuesday" },
  { key: "3", labelKey: "sla.weekdayWednesday" },
  { key: "4", labelKey: "sla.weekdayThursday" },
  { key: "5", labelKey: "sla.weekdayFriday" },
  { key: "6", labelKey: "sla.weekdaySaturday" },
  { key: "7", labelKey: "sla.weekdaySunday" },
] as const;

export const defaultWeeklyHours: WeeklyHours = {
  "1": [{ start: "08:00", end: "16:00" }],
  "2": [{ start: "08:00", end: "16:00" }],
  "3": [{ start: "08:00", end: "16:00" }],
  "4": [{ start: "08:00", end: "16:00" }],
  "5": [{ start: "08:00", end: "16:00" }],
};

export const slaPriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
