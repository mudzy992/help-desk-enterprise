import { describe, expect, it } from "vitest";
import {
  mapInstallCompleteError,
  readInstallCompleteMissingKeys,
} from "@/lib/map-install-complete-error";
import { ApiError } from "@/services/api";

describe("mapInstallCompleteError", () => {
  it("maps SuperAdmin requirement and generic failures", () => {
    expect(mapInstallCompleteError(new ApiError(409, "SUPER_ADMIN_REQUIRED", "missing"))).toBe(
      "install.complete.errorSuperAdmin",
    );
    expect(mapInstallCompleteError(new Error("network"))).toBe("install.complete.errorGeneric");
  });

  it("maps the readiness guard to the not-ready message and its list", () => {
    const error = new ApiError(409, "INSTALL_NOT_READY", "not ready", null, {
      missing: ["routing", "profileSteps"],
    });

    expect(mapInstallCompleteError(error)).toBe("install.complete.notReady");
    expect(readInstallCompleteMissingKeys(error)).toEqual(["routing", "profileSteps"]);
    // Anything else carries no list, so the step shows the sentence only.
    expect(readInstallCompleteMissingKeys(new Error("network"))).toEqual([]);
    expect(
      readInstallCompleteMissingKeys(new ApiError(409, "INSTALL_NOT_READY", "x", null, null)),
    ).toEqual([]);
  });
});
