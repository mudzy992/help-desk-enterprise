import { useEffect, useRef, useState } from "react";
import { loadVisibleOnboardings } from "@/lib/services/load-visible-onboardings";
import type { ServiceCatalogRow } from "@/lib/services/use-service-catalog";
import type { ServiceOnboardingResponse } from "@/services/service-onboarding-api";

export function useVisibleOnboardings(rows: readonly ServiceCatalogRow[]) {
  const [onboardings, setOnboardings] = useState<readonly ServiceOnboardingResponse[]>(
    [],
  );
  const requestSequence = useRef(0);

  useEffect(() => {
    const draftIds = rows
      .filter((row) => row.service.lifecycle === "DRAFT")
      .map((row) => row.service.id);
    const draftIdSet = new Set(draftIds);
    const sequence = ++requestSequence.current;
    setOnboardings((current) =>
      current.filter((onboarding) => draftIdSet.has(onboarding.serviceId)),
    );
    if (draftIds.length === 0) {
      setOnboardings([]);
      return () => {
        requestSequence.current += 1;
      };
    }

    void loadVisibleOnboardings(draftIds, (serviceId, onboarding) => {
      if (sequence !== requestSequence.current) {
        return;
      }
      setOnboardings((current) => {
        const withoutService = current.filter((item) => item.serviceId !== serviceId);
        return onboarding === null ? withoutService : [...withoutService, onboarding];
      });
    }).catch(() => {
      // Keep visible progress when a background refresh fails, but remove
      // records for services which are no longer drafts in the latest read.
      if (sequence === requestSequence.current) {
        setOnboardings((current) =>
          current.filter((onboarding) => draftIdSet.has(onboarding.serviceId)),
        );
      }
    });

    return () => {
      requestSequence.current += 1;
    };
  }, [rows]);

  return onboardings;
}
