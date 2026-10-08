import { describe, expect, it } from "vitest";
import {
  filterServiceCatalogRows,
  shouldWarnServiceRuntimeAvailability,
  type ServiceCatalogFilters,
} from "@/lib/services/filter-service-catalog-rows";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceResponse } from "@/services/service-catalog-api";

function row(
  name: string,
  slug: string,
  lifecycle: ServiceResponse["lifecycle"] = "ACTIVE",
): ServiceCatalogRow {
  const service: ServiceResponse = {
    id: slug,
    name,
    slug,
    categoryId: "cat-it",
    lifecycle,
    offeredToRequesters: true,
    availability: "OPERATIONAL",
    runtimeAvailability: {
      isCurrentlyAvailable: true,
      isCurrentlyUnavailable: false,
      hasActiveDowntime: false,
      hasUpcomingDowntime: false,
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
  return { service };
}

const baseFilters: ServiceCatalogFilters = {
  query: "",
  categoryId: null,
  lifecycle: null,
  originUnitId: null,
  categoryNames: new Map([["cat-it", "IT podrška"]]),
  serviceIdsWithExactRuleByOriginUnit: new Map(),
};

describe("filterServiceCatalogRows", () => {
  const rows = [
    row("VPN pristup", "vpn-access"),
    row("Rezervacija sala", "room-booking"),
    row("VPN pristup — nacrt", "vpn-draft", "DRAFT"),
  ];

  it("returns all rows when the query is empty or whitespace", () => {
    expect(filterServiceCatalogRows(rows, baseFilters)).toEqual(rows);
    expect(filterServiceCatalogRows(rows, { ...baseFilters, query: "   " })).toEqual(rows);
  });

  it("matches names and slugs case-insensitively", () => {
    expect(filterServiceCatalogRows(rows, { ...baseFilters, query: "vpn" })).toEqual([
      rows[0],
      rows[2],
    ]);
    expect(filterServiceCatalogRows(rows, { ...baseFilters, query: "ROOM-BOOKING" })).toEqual([
      rows[1],
    ]);
  });

  it("normalizes diacritics in the query and service/category labels", () => {
    expect(filterServiceCatalogRows(rows, { ...baseFilters, query: "rezervacija" })).toEqual([
      rows[1],
    ]);
    expect(filterServiceCatalogRows(rows, { ...baseFilters, query: "podrska" })).toEqual(rows);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterServiceCatalogRows(rows, { ...baseFilters, query: "payroll" })).toEqual([]);
  });

  it("filters by category and lifecycle", () => {
    expect(
      filterServiceCatalogRows(rows, { ...baseFilters, categoryId: "other" }),
    ).toEqual([]);
    expect(
      filterServiceCatalogRows(rows, { ...baseFilters, categoryId: "cat-it" }),
    ).toEqual(rows);
    expect(
      filterServiceCatalogRows(rows, { ...baseFilters, lifecycle: "DRAFT" }),
    ).toEqual([rows[2]]);
  });

  it("filters by services with an exact rule at the selected OU only", () => {
    const filters: ServiceCatalogFilters = {
      ...baseFilters,
      originUnitId: "ou-1",
      serviceIdsWithExactRuleByOriginUnit: new Map([["ou-1", new Set(["vpn-access"])]]),
    };
    expect(filterServiceCatalogRows(rows, filters)).toEqual([rows[0]]);
  });
});

describe("shouldWarnServiceRuntimeAvailability", () => {
  it("warns on unavailability or active downtime, never as a gate", () => {
    expect(shouldWarnServiceRuntimeAvailability(false, false)).toBe(false);
    expect(shouldWarnServiceRuntimeAvailability(true, false)).toBe(true);
    expect(shouldWarnServiceRuntimeAvailability(false, true)).toBe(true);
  });
});
