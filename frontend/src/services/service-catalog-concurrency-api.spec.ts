import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, apiRequestValidated } from "@/services/api";
import {
  createService,
  transitionServiceLifecycle,
  updateService,
  updateServiceAvailability,
} from "@/services/service-catalog-api";
import {
  createServiceCategory,
  getServiceCategory,
  updateServiceCategory,
} from "@/services/service-categories-api";
import { saveOnboardingServiceStep } from "@/services/service-onboarding-api";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiRequest: vi.fn(),
    apiRequestValidated: vi.fn(),
  };
});

describe("service catalog concurrency request headers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the loaded service revision for metadata, lifecycle, and availability writes", () => {
    updateService("service-1", { name: "VPN", reason: "Rename" }, 12);
    transitionServiceLifecycle("service-1", "ACTIVE", 12);
    updateServiceAvailability("service-1", "DOWN", 12, "Incident");

    expect(apiRequestValidated).toHaveBeenNthCalledWith(
      1,
      "/services/service-1",
      expect.any(Function),
      expect.objectContaining({
        method: "PATCH",
        headers: { "If-Match": '"v12"' },
      }),
    );
    expect(apiRequestValidated).toHaveBeenNthCalledWith(
      2,
      "/services/service-1/lifecycle",
      expect.any(Function),
      expect.objectContaining({
        method: "POST",
        headers: { "If-Match": '"v12"' },
      }),
    );
    expect(apiRequestValidated).toHaveBeenNthCalledWith(
      3,
      "/services/service-1/availability",
      expect.any(Function),
      expect.objectContaining({
        method: "PATCH",
        headers: { "If-Match": '"v12"' },
      }),
    );
  });

  it("validates service/category responses for create and category detail reads", () => {
    createService({
      name: "VPN",
      slug: "vpn",
      categoryId: "category-1",
      reason: "Seed",
    });
    createServiceCategory({ name: "Support", slug: "support" });
    getServiceCategory("category-1");

    expect(apiRequestValidated).toHaveBeenNthCalledWith(
      1,
      "/services",
      expect.any(Function),
      expect.objectContaining({ method: "POST" }),
    );
    expect(apiRequestValidated).toHaveBeenNthCalledWith(
      2,
      "/service-categories",
      expect.any(Function),
      expect.objectContaining({ method: "POST" }),
    );
    expect(apiRequestValidated).toHaveBeenNthCalledWith(
      3,
      "/service-categories/category-1",
      expect.any(Function),
    );
  });

  it("sends the loaded service revision for onboarding service edits", () => {
    saveOnboardingServiceStep("service-1", { name: "VPN" }, 12);
    expect(apiRequest).toHaveBeenCalledWith(
      "/services/service-1/onboarding/service",
      expect.objectContaining({
        method: "PATCH",
        headers: { "If-Match": '"v12"' },
      }),
    );
  });

  it("sends the loaded category revision on parent/name updates", () => {
    updateServiceCategory("category-1", { parentId: null, name: "Root" }, 5);
    expect(apiRequestValidated).toHaveBeenCalledWith(
      "/service-categories/category-1",
      expect.any(Function),
      expect.objectContaining({
        method: "PATCH",
        headers: { "If-Match": '"v5"' },
      }),
    );
  });
});
