import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadVisibleOnboardings } from "@/lib/services/load-visible-onboardings";
import { ApiError } from "@/services/api";
import {
  getServiceOnboarding,
  type ServiceOnboardingResponse,
} from "@/services/service-onboarding-api";

vi.mock("@/services/service-onboarding-api", () => ({
  getServiceOnboarding: vi.fn(),
}));

function onboarding(
  serviceId: string,
  status: ServiceOnboardingResponse["status"] = "IN_PROGRESS",
): ServiceOnboardingResponse {
  return {
    id: `onboarding-${serviceId}`,
    serviceId,
    status,
    currentStep: "SERVICE",
    completedSteps: [],
    formVersionRef: null,
    routingConfigurationRef: null,
    slaConfigurationRef: null,
    approvalsConfigurationRef: null,
    routingSuggestion: null,
    lastValidationErrors: [],
    serviceLifecycle: "DRAFT",
    warnings: [],
    createdAt: "2026-10-09T00:00:00.000Z",
    updatedAt: "2026-10-09T00:00:00.000Z",
  };
}

describe("loadVisibleOnboardings", () => {
  beforeEach(() => {
    vi.mocked(getServiceOnboarding).mockReset();
  });

  it("keeps successful progress when another draft's onboarding read fails", async () => {
    const visible = onboarding("service-visible");
    const completed = onboarding("service-completed", "COMPLETED");
    vi.mocked(getServiceOnboarding).mockImplementation(async (serviceId) => {
      if (serviceId === "service-broken") {
        throw new ApiError(500, "INTERNAL_ERROR", "Unexpected server error");
      }
      if (serviceId === "service-without-onboarding") {
        throw new ApiError(404, "NOT_FOUND", "Onboarding not found");
      }
      return serviceId === "service-completed" ? completed : visible;
    });

    await expect(
      loadVisibleOnboardings([
        "service-visible",
        "service-broken",
        "service-without-onboarding",
        "service-completed",
      ]),
    ).resolves.toEqual([visible]);
  });
});
