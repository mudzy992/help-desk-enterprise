import { describe, expect, it } from "vitest";
import { mapServiceOnboardingError } from "@/lib/services/map-service-onboarding-error";
import { ApiError } from "@/services/api";

describe("mapServiceOnboardingError", () => {
  it("maps onboarding workflow codes", () => {
    expect(mapServiceOnboardingError(new ApiError(400, "DISABLED", "x"))).toBe(
      "services.onboarding.errorDisabled",
    );
    expect(mapServiceOnboardingError(new ApiError(400, "INVALID_STEP_TRANSITION", "x"))).toBe(
      "services.onboarding.errorStep",
    );
    expect(mapServiceOnboardingError(new ApiError(400, "SERVICE_NOT_DRAFT", "x"))).toBe(
      "services.onboarding.errorNotDraft",
    );
    expect(mapServiceOnboardingError(new ApiError(400, "FINAL_VALIDATION_FAILED", "x"))).toBe(
      "services.onboarding.errorFinalize",
    );
    expect(mapServiceOnboardingError(new ApiError(409, "ALREADY_EXISTS", "x"))).toBe(
      "services.onboarding.errorAlreadyExists",
    );
  });
});
