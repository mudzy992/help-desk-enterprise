import { describe, expect, it } from "vitest";
import { mapInstallSeedError } from "@/lib/map-install-seed-error";
import { ApiError } from "@/services/api";

describe("mapInstallSeedError", () => {
  it("maps SuperAdmin requirement", () => {
    expect(
      mapInstallSeedError(new ApiError(409, "SUPER_ADMIN_REQUIRED", "required")),
    ).toBe("install.seed.errorSuperAdmin");
  });

  it("maps unknown failures to the generic seed error", () => {
    expect(
      mapInstallSeedError(
        new ApiError(500, "SEED_ROUTING_UNRESOLVED", "unresolved"),
      ),
    ).toBe("install.seed.errorGeneric");
    expect(mapInstallSeedError(undefined)).toBe("install.seed.errorGeneric");
  });
});
