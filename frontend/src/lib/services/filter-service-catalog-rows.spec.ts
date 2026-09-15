import { describe, expect, it } from "vitest";
import {
  filterServiceCatalogRows,
  shouldWarnServiceRuntimeAvailability,
} from "@/lib/services/filter-service-catalog-rows";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceResponse } from "@/services/service-catalog-api";

function row(name: string, slug: string): ServiceCatalogRow {
  const service: ServiceResponse = {
    id: slug,
    name,
    slug,
    lifecycle: "ACTIVE",
    offeredToRequesters: true,
    availability: "OPERATIONAL",
    runtimeAvailability: {
      isCurrentlyAvailable: true,
      isCurrentlyUnavailable: false,
      hasActiveDowntime: false,
      ticketCreationAllowed: true,
      showStatusInTicketCreate: false,
      activeDowntimeWindow: null,
    },
    classification: "INTERNAL",
    requiresApproval: false,
  };
  return { service, form: null };
}

describe("filterServiceCatalogRows", () => {
  const rows = [
    row("VPN pristup", "vpn-access"),
    row("Rezervacija sala", "room-booking"),
  ];

  it("returns all rows when the query is empty or whitespace", () => {
    expect(filterServiceCatalogRows(rows, "")).toEqual(rows);
    expect(filterServiceCatalogRows(rows, "   ")).toEqual(rows);
  });

  it("matches service name case-insensitively", () => {
    expect(filterServiceCatalogRows(rows, "vpn")).toEqual([rows[0]]);
  });

  it("matches service slug case-insensitively", () => {
    expect(filterServiceCatalogRows(rows, "ROOM-BOOKING")).toEqual([rows[1]]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterServiceCatalogRows(rows, "payroll")).toEqual([]);
  });
});

describe("shouldWarnServiceRuntimeAvailability", () => {
  it("warns on unavailability or active downtime, never as a gate", () => {
    expect(shouldWarnServiceRuntimeAvailability(false, false)).toBe(false);
    expect(shouldWarnServiceRuntimeAvailability(true, false)).toBe(true);
    expect(shouldWarnServiceRuntimeAvailability(false, true)).toBe(true);
  });
});
