import { useMemo } from "react";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceOnboardingSummary } from "@/services/service-catalog-api";

export type VisibleServiceOnboarding = ServiceOnboardingSummary & {
  readonly serviceId: string;
};

/**
 * Derives visible onboarding progress from the batch catalog response. This
 * avoids one expected 404 request for every draft service without onboarding.
 */
export function useVisibleOnboardings(
  rows: readonly ServiceCatalogRow[],
): readonly VisibleServiceOnboarding[] {
  return useMemo(
    () =>
      rows.flatMap((row) => {
        const onboarding = row.service.onboarding;
        return row.service.lifecycle === "DRAFT" &&
          onboarding !== null &&
          onboarding !== undefined &&
          onboarding.status !== "COMPLETED"
          ? [{ ...onboarding, serviceId: row.service.id }]
          : [];
      }),
    [rows],
  );
}
