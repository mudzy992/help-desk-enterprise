import type { HorizontalBarItem } from "@/components/charts/h-bars";
import { SEMANTIC_DOT_HEX } from "@/lib/theme/semantic-meta";
import { ticketPriorityLabelKey } from "@/lib/tickets/ticket-constants";
import type {
  BottleneckBreakdownRow,
  BottleneckCounts,
  BottleneckTrendRow,
} from "@/services/reports-api";

/**
 * Val 1 (M15/B2): usko grlo je do sada postojao samo kao API. Pregled ga sada
 * crta iz istih podataka, a ovdje se odlučuje **šta se broji** — jedan red
 * razreza nosi četiri brojača, pa grafikoni idu sa zbirom („tiketa u zastoju“),
 * a puna tabela ostaje za detalj po brojaču.
 */
export const bottleneckCounterKeys = [
  "pendingApproval",
  "waitingForUser",
  "unrouted",
  "overdue",
] as const;

export type BottleneckCounterKey = (typeof bottleneckCounterKeys)[number];

/** Boje su iste kao u ostatku sistema: neusmjereno upozorava, prekoračeno je rizik. */
const counterColors: Readonly<Record<BottleneckCounterKey, string>> = {
  pendingApproval: SEMANTIC_DOT_HEX.primary,
  waitingForUser: SEMANTIC_DOT_HEX.primary,
  unrouted: SEMANTIC_DOT_HEX.warning,
  overdue: SEMANTIC_DOT_HEX.danger,
};

export const bottleneckCounterColor = counterColors;

/**
 * Ključevi prijevoda kao literali: tipizirani `t()` ne prima dinamički string,
 * pa se mapa drži ovdje (isti obrazac kao `docs-labels.ts`).
 */
export const bottleneckCounterLabelKeys = {
  pendingApproval: "reports.bottlenecks.counters.pendingApproval",
  waitingForUser: "reports.bottlenecks.counters.waitingForUser",
  unrouted: "reports.bottlenecks.counters.unrouted",
  overdue: "reports.bottlenecks.counters.overdue",
} as const;

export function bottleneckTotal(counts: BottleneckCounts): number {
  return bottleneckCounterKeys.reduce((sum, key) => sum + counts[key], 0);
}

/**
 * Prioritet nema šifarnik, pa server šalje vrijednost enuma kao labelu; ovdje
 * se prevodi na jezik interfejsa. Nepoznata vrijednost ostaje kako je došla.
 */
export function bottleneckRowLabel(
  row: BottleneckBreakdownRow,
  translate: (key: string) => string,
): string {
  const label = row.label.length > 0 ? row.label : row.key;
  const key = (ticketPriorityLabelKey as Readonly<Record<string, string>>)[label];
  return key === undefined ? label : translate(key);
}

/**
 * Razrez kao horizontalne trake: vrijednost je ukupan broj tiketa u zastoju, a
 * labela je naziv razreza (nikad sirovi ID).
 */
export function bottleneckBreakdownBars(
  rows: readonly BottleneckBreakdownRow[],
  translate: (key: string) => string = (key) => key,
): readonly HorizontalBarItem[] {
  return rows
    .map((row) => ({ label: bottleneckRowLabel(row, translate), value: bottleneckTotal(row) }))
    .sort((left, right) =>
      right.value === left.value
        ? left.label.localeCompare(right.label)
        : right.value - left.value,
    );
}

/**
 * Dnevni trend zadržava samo dane u kojima se nešto dogodilo (novi tiket ili
 * neko u zastoju), da tabela ne bude puna nula.
 */
export function bottleneckTrendRows(
  rows: readonly BottleneckTrendRow[],
): readonly BottleneckTrendRow[] {
  return rows.filter(
    (row) => row.createdCount > 0 || bottleneckTotal(row) > 0,
  );
}
