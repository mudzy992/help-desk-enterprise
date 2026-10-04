import type { HorizontalBarItem } from "@/components/charts/h-bars";
import { SEMANTIC_DOT_HEX } from "@/lib/theme/semantic-meta";
import type { TicketCsatBucket } from "@/services/tickets-csat-api";

export type CsatBucketRow = {
  readonly key: string;
  /** Ono što se prikazuje: naziv razreza, nikad sirovi ID. */
  readonly label: string;
  readonly count: number;
  readonly average: number;
  /** Da li je prosjek razreza na pragu „zadovoljan“ iz konfiguracije CSAT-a. */
  readonly meetsTarget: boolean;
};

/**
 * Val 1 (M9/B3): razrez CSAT-a (OU/servis/grupa) je do sada bio „mrtva“ površina
 * API-ja. Redovi se sortiraju po broju ocjena (najveći uzorak prvi) — mali uzorci
 * ne smiju izgledati jednako uvjerljivo kao veliki.
 */
export function csatBucketRows(
  buckets: readonly TicketCsatBucket[],
  satisfiedMinRating: number,
): readonly CsatBucketRow[] {
  return [...buckets]
    .map((bucket) => ({
      key: bucket.key,
      // Val 1 (M9/B3): server šalje i naziv; ID je samo rezerva za obrisane zapise.
      label: bucket.label.length > 0 ? bucket.label : bucket.key,
      count: bucket.count,
      average: bucket.average,
      meetsTarget: bucket.average >= satisfiedMinRating,
    }))
    .sort((left, right) =>
      right.count === left.count
        ? left.label.localeCompare(right.label)
        : right.count - left.count,
    );
}

/** Prosjek kao traka: boja prati prag, broj ostaje tačan (jedna decimala). */
export function csatBucketBars(
  rows: readonly CsatBucketRow[],
): readonly HorizontalBarItem[] {
  return rows.map((row) => ({
    label: row.label,
    value: Math.round(row.average * 10) / 10,
    color: row.meetsTarget ? SEMANTIC_DOT_HEX.success : SEMANTIC_DOT_HEX.warning,
  }));
}
