import { describe, expect, it } from "vitest";
import {
  canDeleteCatalogService,
  nextServiceLifecycleTargets,
  serviceLifecycleActionLabelKey,
} from "@/lib/services/allowed-service-lifecycle-transitions";

describe("allowedServiceLifecycleTransitions", () => {
  it("follows DRAFT → ACTIVE → DEPRECATED, with reactivate from DEPRECATED", () => {
    expect(nextServiceLifecycleTargets("DRAFT")).toEqual(["ACTIVE"]);
    expect(nextServiceLifecycleTargets("ACTIVE")).toEqual(["DEPRECATED"]);
    expect(nextServiceLifecycleTargets("DEPRECATED")).toEqual(["ACTIVE"]);
  });

  it("allows delete only for DRAFT", () => {
    expect(canDeleteCatalogService("DRAFT")).toBe(true);
    expect(canDeleteCatalogService("ACTIVE")).toBe(false);
    expect(canDeleteCatalogService("DEPRECATED")).toBe(false);
  });

  it("picks activate / deprecate / reactivate labels from the matrix", () => {
    expect(serviceLifecycleActionLabelKey("DRAFT", "ACTIVE")).toBe(
      "services.activate",
    );
    expect(serviceLifecycleActionLabelKey("ACTIVE", "DEPRECATED")).toBe(
      "services.deprecate",
    );
    expect(serviceLifecycleActionLabelKey("DEPRECATED", "ACTIVE")).toBe(
      "services.reactivate",
    );
  });
});
