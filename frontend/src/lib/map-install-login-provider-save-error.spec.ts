import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import { mapInstallLoginProviderSaveError } from "@/lib/map-install-login-provider-save-error";

describe("mapInstallLoginProviderSaveError", () => {
  it("maps incomplete configuration without using secret values", () => {
    const secret = "ldaps-bind-secret-value";
    const error = new ApiError(
      400,
      "INVALID_LOGIN_PROVIDER_CONFIGURATION",
      secret,
    );
    expect(mapInstallLoginProviderSaveError(error)).toBe(
      "install.loginProvider.errorInvalid",
    );
    expect(mapInstallLoginProviderSaveError(error)).not.toContain(secret);
  });

  it("maps a missing SuperAdmin as a conflict", () => {
    expect(
      mapInstallLoginProviderSaveError(
        new ApiError(409, "SUPER_ADMIN_REQUIRED", "required"),
      ),
    ).toBe("install.loginProvider.errorSuperAdmin");
  });
});
