import { describe, expect, it } from "vitest";
import {
  isServiceListedInMaintenance,
  parsePublicMaintenance,
  shouldShowGlobalMaintenanceBanner,
} from "@/lib/maintenance/parse-public-maintenance";

describe("parsePublicMaintenance", () => {
  it("reads enabled maintenance window and scope", () => {
    const state = parsePublicMaintenance({
      "public.maintenance.enabled": true,
      "public.maintenance.message": "Upgrade window",
      "public.maintenance.fromAt": "2026-09-16T10:00:00.000Z",
      "public.maintenance.toAt": "2026-09-16T12:00:00.000Z",
      "public.maintenance.scope": "both",
      "public.maintenance.affectedServicesCsv": "svc-1, Mail",
    });
    expect(state.enabled).toBe(true);
    expect(state.message).toBe("Upgrade window");
    expect(shouldShowGlobalMaintenanceBanner(state)).toBe(true);
    expect(
      isServiceListedInMaintenance(state, {
        id: "svc-1",
        name: "Email",
        slug: "email",
      }),
    ).toBe(true);
  });

  it("hides global banner for per_service scope", () => {
    const state = parsePublicMaintenance({
      "public.maintenance.enabled": true,
      "public.maintenance.scope": "per_service",
      "public.maintenance.affectedServicesCsv": "email",
    });
    expect(shouldShowGlobalMaintenanceBanner(state)).toBe(false);
    expect(
      isServiceListedInMaintenance(state, {
        id: "x",
        name: "Email",
        slug: "email",
      }),
    ).toBe(true);
  });
});
