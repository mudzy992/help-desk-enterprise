import type { ReportCell } from "@/services/report-packs-api";

export type ReportSort = { readonly column: string; readonly direction: "asc" | "desc" };

const isoInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Numbers numerically, text with the local collation, nulls always last. */
export function sortReportRows(
  rows: readonly Record<string, ReportCell>[],
  sort: ReportSort | null,
  locale: string,
): readonly Record<string, ReportCell>[] {
  if (sort === null) {
    return rows;
  }
  const factor = sort.direction === "asc" ? 1 : -1;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return [...rows].sort((left, right) => {
    const a = left[sort.column] ?? null;
    const b = right[sort.column] ?? null;
    if (a === null || b === null) {
      return a === b ? 0 : a === null ? 1 : -1;
    }
    if (typeof a === "number" && typeof b === "number") {
      return (a - b) * factor;
    }
    return collator.compare(String(a), String(b)) * factor;
  });
}

export function nextReportSort(current: ReportSort | null, column: string): ReportSort {
  if (current?.column !== column) {
    return { column, direction: "desc" };
  }
  return { column, direction: current.direction === "desc" ? "asc" : "desc" };
}

/** Display form of one cell: local date-time for ISO instants, grouped numbers. */
export function formatReportCell(
  value: ReportCell,
  locale: string,
  labels: { readonly confidential: string },
): string {
  if (value === null) {
    return "—";
  }
  if (typeof value === "number") {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  }
  if (value === "[confidential]") {
    return labels.confidential;
  }
  if (isoInstant.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
    }
  }
  return value;
}
