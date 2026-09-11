import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import { mapInstallSmtpSaveError } from "@/lib/map-install-smtp-save-error";

describe("mapInstallSmtpSaveError", () => {
  it("maps invalid SMTP configuration to the invalid error key", () => {
    expect(
      mapInstallSmtpSaveError(
        new ApiError(400, "INVALID_SMTP_CONFIGURATION", "invalid"),
      ),
    ).toBe("install.smtp.errorInvalid");
  });

  it("maps a missing SuperAdmin to the SuperAdmin error key", () => {
    expect(
      mapInstallSmtpSaveError(
        new ApiError(409, "SUPER_ADMIN_REQUIRED", "missing"),
      ),
    ).toBe("install.smtp.errorSuperAdmin");
  });
});
