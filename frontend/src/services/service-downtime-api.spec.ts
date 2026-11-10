import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
import {
  collectServiceDowntimeWindowPages,
  serviceDowntimeWindowListMaximumPages,
  serviceDowntimeWindowListPageSize,
  type DowntimeWindowListPage,
  type DowntimeWindowListQuery,
  type DowntimeWindowResponse,
} from "@/services/service-downtime-api";

const period = {
  from: "2026-01-01T00:00:00.000Z",
  to: "2027-01-01T00:00:00.000Z",
};

function downtimeWindow(id: string): DowntimeWindowResponse {
  return {
    id,
    serviceId: "service-1",
    startsAt: "2026-02-01T00:00:00.000Z",
    endsAt: "2026-02-01T01:00:00.000Z",
    message: `Window ${id}`,
    phase: "UPCOMING",
    isActive: false,
    isUpcoming: true,
    isExpired: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function page(
  items: readonly DowntimeWindowResponse[],
  input: {
    readonly cursor?: string | null;
    readonly nextCursor?: string | null;
    readonly hasMore?: boolean;
  } = {},
): DowntimeWindowListPage {
  return {
    items,
    total: 2,
    take: serviceDowntimeWindowListPageSize,
    cursor: input.cursor ?? null,
    nextCursor: input.nextCursor ?? null,
    hasMore: input.hasMore ?? false,
    period,
  };
}

describe("collectServiceDowntimeWindowPages", () => {
  it("preserves the server period across cursor requests", async () => {
    const loadPage = vi.fn(async (query: DowntimeWindowListQuery) => {
      if (query.cursor === null) {
        return page([downtimeWindow("1")], { nextCursor: "next-1", hasMore: true });
      }
      return page([downtimeWindow("2")], { cursor: "next-1" });
    });

    const result = await collectServiceDowntimeWindowPages(loadPage);
    expect(result.map((item) => item.id)).toEqual(["1", "2"]);
    expect(loadPage).toHaveBeenNthCalledWith(1, {
      take: serviceDowntimeWindowListPageSize,
      cursor: null,
    });
    expect(loadPage).toHaveBeenNthCalledWith(2, {
      take: serviceDowntimeWindowListPageSize,
      cursor: "next-1",
      from: period.from,
      to: period.to,
    });
  });

  it("fails closed on cursor cycles and the client page ceiling", async () => {
    const cycle = vi.fn(async (query: DowntimeWindowListQuery) =>
      page([downtimeWindow(query.cursor ?? "first")], {
        cursor: query.cursor,
        nextCursor: "same",
        hasMore: true,
      }),
    );
    await expect(collectServiceDowntimeWindowPages(cycle)).rejects.toMatchObject({
      code: "INVALID_DOWNTIME_WINDOW_PAGINATION",
    });
    expect(cycle).toHaveBeenCalledTimes(2);

    const beyondCeiling = vi.fn(async (query: DowntimeWindowListQuery) => {
      const index = query.cursor === null ? 0 : Number(query.cursor);
      return page([downtimeWindow(String(index))], {
        cursor: query.cursor,
        nextCursor: String(index + 1),
        hasMore: true,
      });
    });
    await expect(collectServiceDowntimeWindowPages(beyondCeiling)).rejects.toMatchObject({
      code: "DOWNTIME_WINDOW_RESOURCE_LIMIT_EXCEEDED",
    });
    expect(beyondCeiling).toHaveBeenCalledTimes(serviceDowntimeWindowListMaximumPages);
  });

  it("rejects an empty non-terminal page", async () => {
    const loadPage = vi.fn(async () => page([], { nextCursor: "next", hasMore: true }));
    await expect(collectServiceDowntimeWindowPages(loadPage)).rejects.toBeInstanceOf(ApiError);
  });
});
