import { useEffect, useState } from "react";
import { loadVisibleOnboardings } from "@/lib/services/load-visible-onboardings";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceOnboardingResponse } from "@/services/service-onboarding-api";

export function useVisibleOnboardings(rows: readonly ServiceCatalogRow[]) {
  const [onboardings, setOnboardings] = useState<readonly ServiceOnboardingResponse[]>(
    [],
  );

  useEffect(() => {
    const draftIds = rows
      .filter((row) => row.service.lifecycle === "DRAFT")
      .map((row) => row.service.id);
    let cancelled = false;
    void loadVisibleOnboardings(draftIds)
      .then((loaded) => {
        if (!cancelled) {
          setOnboardings(loaded);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOnboardings([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  return onboardings;
}
