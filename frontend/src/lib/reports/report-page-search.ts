import { reportPresets, type ReportPreset } from "@/lib/reports/report-window";

export const reportTabs = [
  "overview",
  "bottlenecks",
  "csat",
  "trends",
  "packs",
  "schedules",
] as const;
export type ReportsTab = (typeof reportTabs)[number];

export type ReportPageSearch = {
  readonly tab: ReportsTab;
  readonly organizationalUnitId: string | null;
  readonly preset: ReportPreset;
  readonly customFrom: string;
  readonly customTo: string;
};

export function parseReportPageSearch(
  params: URLSearchParams,
  canSchedule: boolean,
): ReportPageSearch {
  const rawTab = params.get("tab");
  const tab =
    reportTabs.includes(rawTab as ReportsTab) && (rawTab !== "schedules" || canSchedule)
      ? (rawTab as ReportsTab)
      : "overview";
  const rawPreset = params.get("window");
  const preset = reportPresets.includes(rawPreset as ReportPreset)
    ? (rawPreset as ReportPreset)
    : "30d";
  return {
    tab,
    organizationalUnitId: params.get("organizationalUnitId"),
    preset,
    customFrom: preset === "custom" ? (params.get("windowFrom") ?? "") : "",
    customTo: preset === "custom" ? (params.get("windowTo") ?? "") : "",
  };
}

export function updateReportPageSearch(
  current: URLSearchParams,
  patch: Partial<ReportPageSearch>,
): URLSearchParams {
  const next = new URLSearchParams(current);
  const set = (key: string, value: string | null | undefined, defaultValue?: string) => {
    if (value === null || value === undefined || value === "" || value === defaultValue)
      next.delete(key);
    else next.set(key, value);
  };
  if (patch.tab !== undefined) set("tab", patch.tab, "overview");
  if (patch.organizationalUnitId !== undefined)
    set("organizationalUnitId", patch.organizationalUnitId);
  if (patch.preset !== undefined) {
    set("window", patch.preset, "30d");
    if (patch.preset !== "custom") {
      next.delete("windowFrom");
      next.delete("windowTo");
    }
  }
  if (patch.customFrom !== undefined) set("windowFrom", patch.customFrom);
  if (patch.customTo !== undefined) set("windowTo", patch.customTo);
  return next;
}
