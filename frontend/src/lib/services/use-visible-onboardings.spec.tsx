// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import { useVisibleOnboardings } from "@/lib/services/use-visible-onboardings";

function row(
  id: string,
  lifecycle: "DRAFT" | "PUBLISHED",
  onboarding?: {
    readonly status: "IN_PROGRESS" | "COMPLETED";
    readonly currentStep: "SLA";
    readonly completedSteps: readonly "SERVICE"[];
  } | null,
): ServiceCatalogRow {
  return { service: { id, lifecycle, onboarding } } as unknown as ServiceCatalogRow;
}

const activeOnboarding = {
  status: "IN_PROGRESS" as const,
  currentStep: "SLA" as const,
  completedSteps: ["SERVICE"] as const,
};

describe("useVisibleOnboardings", () => {
  afterEach(cleanup);

  it("derives only active draft onboardings from the batch catalog rows", () => {
    const rows = [
      row("draft-active", "DRAFT", activeOnboarding),
      row("draft-missing", "DRAFT", null),
      row("draft-completed", "DRAFT", {
        ...activeOnboarding,
        status: "COMPLETED",
      }),
      row("published-active", "PUBLISHED", activeOnboarding),
    ];

    const { result, rerender } = renderHook(
      ({ catalogRows }: { readonly catalogRows: readonly ServiceCatalogRow[] }) =>
        useVisibleOnboardings(catalogRows),
      { initialProps: { catalogRows: rows } },
    );

    expect(result.current).toEqual([{ ...activeOnboarding, serviceId: "draft-active" }]);

    rerender({ catalogRows: [...rows] });
    expect(result.current).toEqual([{ ...activeOnboarding, serviceId: "draft-active" }]);
  });
});
