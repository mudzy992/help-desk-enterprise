import { describe, expect, it } from "vitest";
import { csatBucketBars, csatBucketRows } from "@/lib/reports/csat-view";
import type { TicketCsatBucket } from "@/services/tickets-csat-api";

const buckets: readonly TicketCsatBucket[] = [
  { key: "svc-vpn", label: "Pristup mreži", count: 2, average: 4 },
  { key: "svc-mail", label: "E-pošta", count: 12, average: 4.4 },
  { key: "svc-slow", label: "Sporo", count: 2, average: 2 },
];

describe("csat-view (val 1, M9/B3)", () => {
  it("sortira razrez po broju ocjena, pa po nazivu", () => {
    const rows = csatBucketRows(buckets, 4);
    // Jednak uzorak (2) razrješava se po nazivu: "Pristup mreži" je prije "Sporo".
    expect(rows.map((row) => row.key)).toEqual(["svc-mail", "svc-vpn", "svc-slow"]);
    expect(rows.map((row) => row.label)).toEqual(["E-pošta", "Pristup mreži", "Sporo"]);
  });

  it("prikazuje naziv, a sirovi ID samo kad naziva nema (regresija: ID-evi u tabu)", () => {
    const rows = csatBucketRows(
      [
        { key: "ou-it", label: "IT Ops", count: 3, average: 5 },
        { key: "ou-gone", label: "", count: 1, average: 3 },
      ],
      4,
    );

    expect(rows.map((row) => row.label)).toEqual(["IT Ops", "ou-gone"]);
    expect(csatBucketBars(rows).map((bar) => bar.label)).toEqual(["IT Ops", "ou-gone"]);
  });

  it("prag dolazi iz konfiguracije: na skali 10 traži 8", () => {
    const onFive = csatBucketRows(
      [{ key: "a", label: "A", count: 1, average: 4 }],
      4,
    );
    expect(onFive[0].meetsTarget).toBe(true);
    const onTen = csatBucketRows(
      [{ key: "a", label: "A", count: 1, average: 4 }],
      8,
    );
    expect(onTen[0].meetsTarget).toBe(false);
  });

  it("trake nose prosjek zaokružen na jednu decimalu i boju po pragu", () => {
    const bars = csatBucketBars(csatBucketRows(buckets, 4));
    expect(bars.map((bar) => bar.value)).toEqual([4.4, 4, 2]);
    // E-pošta (4.4) je iznad praga, Sporo (2) nije — boje se razlikuju.
    expect(bars[0].color).not.toBe(bars[2].color);
  });

  it("prazan razrez daje prazne redove", () => {
    expect(csatBucketRows([], 4)).toEqual([]);
    expect(csatBucketBars([])).toEqual([]);
  });
});
