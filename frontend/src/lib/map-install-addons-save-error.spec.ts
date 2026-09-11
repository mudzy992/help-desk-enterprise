import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import { mapInstallAddonsSaveError } from "@/lib/map-install-addons-save-error";

describe("mapInstallAddonsSaveError", () => {
  it("maps unsupported addon keys to the unsupported error key", () => {
    expect(
      mapInstallAddonsSaveError(
        new ApiError(400, "UNSUPPORTED_ADDON_KEY", "unsupported"),
      ),
    ).toBe("install.addons.errorUnsupported");
  });

  it("maps a missing SuperAdmin to the SuperAdmin error key", () => {
    expect(
      mapInstallAddonsSaveError(
        new ApiError(409, "SUPER_ADMIN_REQUIRED", "missing"),
      ),
    ).toBe("install.addons.errorSuperAdmin");
  });
});
