import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/services/api";
import {
  collectServicePages,
  serviceListMaximumAggregatePages,
  serviceListPageSize,
  type ServiceListPage,
  type ServiceListQuery,
  type ServiceResponse,
} from "@/services/service-catalog-api";

function service(id: string): ServiceResponse {
  return {
    id,
    name: `Service ${id}`,
    slug: `service-${id}`,
    categoryId: "category-1",
    lifecycle: "ACTIVE",
    offeredToRequesters: true,
    availability: "OPERATIONAL",
    runtimeAvailability: {
      isCurrentlyAvailable: true,
      isCurrentlyUnavailable: false,
      hasActiveDowntime: false,
      hasUpcomingDowntime: false,
      upcomingDowntimeCount: 0,
      ticketCreationAllowed: true,
      showStatusInTicketCreate: false,
      activeDowntimeWindow: null,
      upcomingDowntimeWindow: null,
    },
    classification: "INTERNAL",
    requiresApproval: false,
    approvalSteps: 0,
    isConfidentialDefault: false,
    autoAssignStrategy: "NONE",
    slaProfileId: null,
    policyPackId: null,
    openTicketCount: 0,
    activeForm: { activeFormVersionRef: null, version: null, fieldCount: 0 },
  };
}

function page(
  items: readonly ServiceResponse[],
  input: {
    readonly cursor?: string | null;
    readonly nextCursor?: string | null;
    readonly hasMore?: boolean;
  } = {},
): ServiceListPage {
  return {
    items,
    total: 3,
    take: serviceListPageSize,
    cursor: input.cursor ?? null,
    nextCursor: input.nextCursor ?? null,
    hasMore: input.hasMore ?? false,
  };
}

describe("collectServicePages", () => {
  it("collects every page while preserving the supplied filters", async () => {
    const loadPage = vi.fn(async (query: ServiceListQuery) => {
      if (query.cursor === null) {
        return page([service("1"), service("2")], { nextCursor: "next-1", hasMore: true });
      }
      return page([service("3")], { cursor: "next-1" });
    });

    const result = await collectServicePages(loadPage, {
      offeredOnly: true,
      search: "vpn",
    });
    expect(result.map((item) => item.id)).toEqual(["1", "2", "3"]);
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(loadPage).toHaveBeenNthCalledWith(1, {
      offeredOnly: true,
      search: "vpn",
      take: serviceListPageSize,
      cursor: null,
    });
    expect(loadPage).toHaveBeenNthCalledWith(2, {
      offeredOnly: true,
      search: "vpn",
      take: serviceListPageSize,
      cursor: "next-1",
    });
  });

  it("collects the declared 500-service fixture through five bounded 100-item pages", async () => {
    const loadPage = vi.fn(async (query: ServiceListQuery) => {
      const pageIndex = query.cursor === null ? 0 : Number(query.cursor);
      const nextIndex = pageIndex + 1;
      return {
        items: Array.from({ length: serviceListPageSize }, (_, index) =>
          service(String(pageIndex * serviceListPageSize + index)),
        ),
        total: 500,
        take: serviceListPageSize,
        cursor: query.cursor ?? null,
        nextCursor: nextIndex < 5 ? String(nextIndex) : null,
        hasMore: nextIndex < 5,
      } satisfies ServiceListPage;
    });
    const result = await collectServicePages(loadPage);
    expect(result).toHaveLength(500);
    expect(new Set(result.map((item) => item.id)).size).toBe(500);
    expect(loadPage).toHaveBeenCalledTimes(5);
  });

  it("fails closed on cursor cycles and beyond the explicit aggregate ceiling", async () => {
    const cycle = vi.fn(async (query: ServiceListQuery) =>
      page([service(query.cursor ?? "first")], { nextCursor: "same", hasMore: true }),
    );
    await expect(collectServicePages(cycle)).rejects.toMatchObject({
      code: "INVALID_SERVICE_LIST_PAGINATION",
    });
    expect(cycle).toHaveBeenCalledTimes(2);

    const beyondCeiling = vi.fn(async (query: ServiceListQuery) => {
      const pageIndex = query.cursor === null ? 0 : Number(query.cursor);
      return page([service(String(pageIndex))], {
        nextCursor: String(pageIndex + 1),
        hasMore: true,
      });
    });
    await expect(collectServicePages(beyondCeiling)).rejects.toMatchObject({
      code: "SERVICE_CATALOG_RESOURCE_LIMIT_EXCEEDED",
    });
    expect(beyondCeiling).toHaveBeenCalledTimes(serviceListMaximumAggregatePages);
  });

  it("does not treat an empty page with hasMore as a successful terminal page", async () => {
    const loadPage = vi.fn(async () => page([], { nextCursor: "next", hasMore: true }));
    await expect(collectServicePages(loadPage)).rejects.toBeInstanceOf(ApiError);
  });
});
