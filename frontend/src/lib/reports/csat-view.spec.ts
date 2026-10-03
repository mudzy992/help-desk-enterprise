import { describe, expect, it } from "vitest";
import { csatBucketBars, csatBucketRows } from "@/lib/reports/csat-view";
import type { TicketCsatBucket } from "@/services/tickets-csat-api";

const buckets: readonly TicketCsatBucket[] = [
  { key: "svc-vpn", count: 2, average: 4 },
  { key: "svc-mail", count: 12, average: 4.4 },
  { key: "svc-slow", count: 2, average: 2 },
];

describe("csat-view (val 1, M9/B3)", () => {
  it("sortira razrez po broju ocjena, pa po nazivu", () => {
    const rows = csatBucketRows(buckets, 4);
    // Jednak uzorak (2) razrješava se po nazivu, pa je "svc-slow" prije "svc-vpn".
    expect(rows.map((row) => row.key)).toEqual(["svc-mail", "svc-slow", "svc-vpn"]);
  });

  it("prag dolazi iz konfiguracije: na skali 10 traži 8", () => {
    const onFive = csatBucketRows([{ key: "a", count: 1, average: 4 }], 4);
    expect(onFive[0].meetsTarget).toBe(true);
    const onTen = csatBucketRows([{ key: "a", count: 1, average: 4 }], 8);
    expect(onTen[0].meetsTarget).toBe(false);
  });

  it("trake nose prosjek zaokružen na jednu decimalu i boju po pragu", () => {
    const bars = csatBucketBars(csatBucketRows(buckets, 4));
    expect(bars.map((bar) => bar.value)).toEqual([4.4, 2, 4]);
    // svc-mail (4.4) je iznad praga, svc-slow (2) nije — boje se razlikuju.
    expect(bars[0].color).not.toBe(bars[1].color);
  });

  it("prazan razrez daje prazne redove", () => {
    expect(csatBucketRows([], 4)).toEqual([]);
    expect(csatBucketBars([])).toEqual([]);
  });
});
