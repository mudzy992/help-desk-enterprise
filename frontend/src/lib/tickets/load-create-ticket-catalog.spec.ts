import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadCreateTicketCatalog } from "@/lib/tickets/load-create-ticket-catalog";
import { ApiError } from "@/services/api";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import {
  listOfferedServices,
  type ServiceResponse,
  type ServiceRuntimeAvailability,
} from "@/services/service-catalog-api";

vi.mock("@/services/organizational-units-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/organizational-units-api")>();
  return { ...actual, listOrganizationalUnitTree: vi.fn() };
});

vi.mock("@/services/service-catalog-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/service-catalog-api")>();
  return { ...actual, listOfferedServices: vi.fn() };
});

const runtimeAvailability: ServiceRuntimeAvailability = {
  isCurrentlyAvailable: true,
  isCurrentlyUnavailable: false,
  hasActiveDowntime: false,
  hasUpcomingDowntime: false,
  ticketCreationAllowed: true,
  showStatusInTicketCreate: false,
  activeDowntimeWindow: null,
  upcomingDowntimeWindow: null,
};

const vpnService: ServiceResponse = {
  id: "svc-vpn",
  name: "VPN",
  slug: "vpn",
  categoryId: "cat-it",
  lifecycle: "ACTIVE",
  offeredToRequesters: true,
  availability: "OPERATIONAL",
  runtimeAvailability,
  classification: "INTERNAL",
  requiresApproval: false,
  openTicketCount: 0,
};

describe("loadCreateTicketCatalog", () => {
  beforeEach(() => {
    vi.mocked(listOfferedServices).mockReset();
    vi.mocked(listOrganizationalUnitTree).mockReset();
  });

  it("keeps offered services when the OU tree returns 403", async () => {
    vi.mocked(listOfferedServices).mockResolvedValue([vpnService]);
    vi.mocked(listOrganizationalUnitTree).mockRejectedValue(
      new ApiError(403, "FORBIDDEN", "Forbidden"),
    );
    const result = await loadCreateTicketCatalog();
    expect(result.errorKey).toBeNull();
    expect(result.services).toEqual([vpnService]);
    expect(result.originUnits).toEqual([]);
  });

  it("keeps offered services when the OU tree returns 500", async () => {
    vi.mocked(listOfferedServices).mockResolvedValue([vpnService]);
    vi.mocked(listOrganizationalUnitTree).mockRejectedValue(
      new ApiError(500, "INTERNAL", "Server error"),
    );
    const result = await loadCreateTicketCatalog();
    expect(result.errorKey).toBeNull();
    expect(result.services).toHaveLength(1);
    expect(result.originUnits).toEqual([]);
  });

  it("sets catalog error only when offered services fail", async () => {
    vi.mocked(listOfferedServices).mockRejectedValue(
      new ApiError(500, "INTERNAL", "Server error"),
    );
    vi.mocked(listOrganizationalUnitTree).mockResolvedValue([
      { id: "ou-it", name: "IT", ouPath: "/IT", children: [] },
    ]);
    const result = await loadCreateTicketCatalog();
    expect(result.errorKey).toBe("tickets.errorCatalog");
    expect(result.services).toEqual([]);
    expect(result.originUnits).toEqual([{ id: "ou-it", label: "/IT" }]);
  });
});
