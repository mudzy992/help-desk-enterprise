import { describe, expect, it } from "vitest";
import {
  catalogRoutingCoverageMaximumPages,
  loadCatalogRoutingCoverage,
} from "@/lib/services/load-catalog-routing-coverage";
import type {
  RoutingCoverageItem,
  RoutingCoveragePage,
  RoutingCoverageQuery,
} from "@/services/routing-api";

const item = (index: number) => ({ serviceId: `service-${index}` }) as RoutingCoverageItem;

function fixtureLoader(total: number, pageSize = 50) {
  const requested: RoutingCoverageQuery[] = [];
  const load = async (query: RoutingCoverageQuery): Promise<RoutingCoveragePage> => {
    requested.push(query);
    const offset = query.cursor === undefined ? 0 : Number(query.cursor);
    const count = Math.min(pageSize, total - offset);
    const next = offset + count;
    return {
      items: Array.from({ length: count }, (_, index) => item(offset + index)),
      total,
      take: pageSize,
      cursor: query.cursor ?? null,
      nextCursor: next < total ? String(next) : null,
    };
  };
  return { requested, load };
}

describe("loadCatalogRoutingCoverage", () => {
  it.each([
    [10, 1],
    [100, 2],
    [1_000, 20],
    [10_000, 200],
  ])("loads a %i-service fixture in exactly %i bounded pages", async (total, pages) => {
    const fixture = fixtureLoader(total);
    await expect(loadCatalogRoutingCoverage(fixture.load)).resolves.toHaveLength(total);
    expect(fixture.requested).toHaveLength(pages);
    expect(fixture.requested[0]).toEqual({ includeInactive: true });
  });

  it("fails closed on a repeated cursor", async () => {
    const load = async (): Promise<RoutingCoveragePage> => ({
      items: [],
      total: 100,
      take: 50,
      cursor: null,
      nextCursor: "same",
    });
    await expect(loadCatalogRoutingCoverage(load)).rejects.toThrow("cursor cycle");
  });

  it("refuses to start request 201 for an oversized catalog", async () => {
    let requests = 0;
    const load = async (): Promise<RoutingCoveragePage> => {
      requests += 1;
      return {
        items: [],
        total: 10_001,
        take: 50,
        cursor: null,
        nextCursor: `page-${requests + 1}`,
      };
    };
    await expect(loadCatalogRoutingCoverage(load)).rejects.toThrow("catalog ceiling");
    expect(requests).toBe(catalogRoutingCoverageMaximumPages);
  });
});
