import { describe, expect, it } from "vitest";
import { mapInstallCompleteError } from "@/lib/map-install-complete-error";
import { ApiError } from "@/services/api";

describe("mapInstallCompleteError", () => {
  it("maps SuperAdmin requirement and generic failures", () => {
    expect(
      mapInstallCompleteError(
        new ApiError(409, "SUPER_ADMIN_REQUIRED", "missing"),
      ),
    ).toBe("install.complete.errorSuperAdmin");
    expect(mapInstallCompleteError(new Error("network"))).toBe(
      "install.complete.errorGeneric",
    );
  });
});
