import type { HorizontalBarItem } from "@/components/charts/h-bars";
import { SEMANTIC_DOT_HEX } from "@/lib/theme/semantic-meta";
import type {
  ReportDashboardAging,
  ReportDashboardNamedBar,
} from "@/services/reports-api";

export const reportHoursSuffix = "h";

/**
 * Val 1 (M15/B1): koje sekcije pregleda izvještaja ima smisla crtati.
 * Postavka `private.dashboard.bottlenecks.enabled` mora važiti i za prikaz —
 * server tada vraća prazan razrez, a ovdje se kartica uopšte ne renderuje
 * (umjesto praznog stanja koje izgleda kao „nema podataka“).
 */
export function dashboardChartSections(dashboard: {
  readonly bottlenecksEnabled: boolean;
}): readonly ("bottleneck" | "volume" | "unit" | "workload" | "flow")[] {
  return dashboard.bottlenecksEnabled
    ? ["bottleneck", "volume", "unit", "workload", "flow"]
    : ["volume", "unit", "workload", "flow"];
}

export function showBottleneckChart(dashboard: {
  readonly bottlenecksEnabled: boolean;
}): boolean {
  return dashboardChartSections(dashboard).includes("bottleneck");
}

export type ReportAgingLabels = {
  readonly lessThanOneDay: string;
  readonly oneToThreeDays: string;
  readonly threeToSevenDays: string;
  readonly moreThanSevenDays: string;
};

export function mapBottleneckBars(
  rows: readonly ReportDashboardNamedBar[],
): { readonly items: readonly HorizontalBarItem[]; readonly bottleneckLabel: string | null } {
  const max = rows[0]?.value;
  return {
    bottleneckLabel: rows[0]?.label ?? null,
    items: rows.map((row) => ({
      label: row.label,
      value: row.value,
      suffix: reportHoursSuffix,
      color:
        max !== undefined && row.value === max
          ? SEMANTIC_DOT_HEX.warning
          : SEMANTIC_DOT_HEX.primary,
    })),
  };
}

export function mapServiceVolumeBars(
  rows: readonly ReportDashboardNamedBar[],
): readonly HorizontalBarItem[] {
  return rows.map((row) => ({
    label: row.label,
    value: row.value,
    color: SEMANTIC_DOT_HEX.primary,
  }));
}

/**
 * Val 1 (M15 gap): brojčani razrez (po OU, po izvršiocu) ne nosi suffix —
 * vrijednost je broj tiketa, a ne sati.
 */
export function mapCountBars(
  rows: readonly ReportDashboardNamedBar[],
): readonly HorizontalBarItem[] {
  return rows.map((row) => ({
    label: row.label,
    value: row.value,
    color: SEMANTIC_DOT_HEX.primary,
  }));
}

/** Opterećenje: najopterećeniji izvršilac nosi upozorenje, ostali primarnu boju. */
export function mapWorkloadBars(
  rows: readonly ReportDashboardNamedBar[],
): readonly HorizontalBarItem[] {
  const max = rows[0]?.value;
  return rows.map((row) => ({
    label: row.label,
    value: row.value,
    color:
      max !== undefined && row.value === max
        ? SEMANTIC_DOT_HEX.warning
        : SEMANTIC_DOT_HEX.primary,
  }));
}

export function mapAgingBars(
  aging: ReportDashboardAging,
  labels: ReportAgingLabels,
): readonly HorizontalBarItem[] {
  return [
    {
      label: labels.lessThanOneDay,
      value: aging.lessThanOneDay,
      color: SEMANTIC_DOT_HEX.success,
    },
    {
      label: labels.oneToThreeDays,
      value: aging.oneToThreeDays,
      color: SEMANTIC_DOT_HEX.primary,
    },
    {
      label: labels.threeToSevenDays,
      value: aging.threeToSevenDays,
      color: SEMANTIC_DOT_HEX.warning,
    },
    {
      label: labels.moreThanSevenDays,
      value: aging.moreThanSevenDays,
      color: SEMANTIC_DOT_HEX.danger,
    },
  ];
}
