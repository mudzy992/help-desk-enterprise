import { describe, expect, it } from "vitest";
import { serviceCatalogLoadState } from "@/lib/services/service-catalog-load-state";

describe("serviceCatalogLoadState", () => {
  it("shows the initial loading state while the first catalog read is pending", () => {
    expect(
      serviceCatalogLoadState({
        services: { hasLoaded: false, isLoading: true, hasError: false },
        categories: { hasLoaded: false, isLoading: true },
      }),
    ).toBe("loading");
  });

  it("shows a blocking error only when services failed before any successful read", () => {
    expect(
      serviceCatalogLoadState({
        services: { hasLoaded: false, isLoading: false, hasError: true },
        categories: { hasLoaded: true, isLoading: false },
      }),
    ).toBe("error");
  });

  it("keeps the last successful rows visible during a failed service refetch", () => {
    expect(
      serviceCatalogLoadState({
        services: { hasLoaded: true, isLoading: false, hasError: true },
        categories: { hasLoaded: true, isLoading: false },
      }),
    ).toBe("ready");
  });

  it("does not replace already loaded rows while categories refresh", () => {
    expect(
      serviceCatalogLoadState({
        services: { hasLoaded: true, isLoading: false, hasError: false },
        categories: { hasLoaded: true, isLoading: true },
      }),
    ).toBe("ready");
  });
});
