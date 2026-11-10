import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, apiRequestValidated } from "@/services/api";
import {
  createService,
  deleteService,
  transitionServiceLifecycle,
  updateService,
  updateServiceAvailability,
} from "@/services/service-catalog-api";
import {
  createServiceCategory,
  deleteServiceCategory,
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
    transitionServiceLifecycle("service-1", "ACTIVE", 12, "Publish approved service");
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
        body: JSON.stringify({ lifecycle: "ACTIVE", reason: "Publish approved service" }),
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
    createServiceCategory({
      name: "Support",
      slug: "support",
      reason: "Organize the service catalogue",
    });
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
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Support",
          slug: "support",
          reason: "Organize the service catalogue",
        }),
      }),
    );
    expect(apiRequestValidated).toHaveBeenNthCalledWith(
      3,
      "/service-categories/category-1",
      expect.any(Function),
    );
  });

  it("sends supplied reasons for service and category deletion", () => {
    deleteService("service-1", "The draft was created in error");
    deleteServiceCategory("category-1", "The group is no longer used");

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "/services/service-1?reason=The+draft+was+created+in+error",
      { method: "DELETE" },
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "/service-categories/category-1?reason=The+group+is+no+longer+used",
      { method: "DELETE" },
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
    updateServiceCategory(
      "category-1",
      { parentId: null, name: "Root", reason: "Make this a root group" },
      5,
    );
    expect(apiRequestValidated).toHaveBeenCalledWith(
      "/service-categories/category-1",
      expect.any(Function),
      expect.objectContaining({
        method: "PATCH",
        headers: { "If-Match": '"v5"' },
        body: JSON.stringify({ parentId: null, name: "Root", reason: "Make this a root group" }),
      }),
    );
  });
});
