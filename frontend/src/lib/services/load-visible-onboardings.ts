import { ApiError } from "@/services/api";
import {
  getServiceOnboarding,
  type ServiceOnboardingResponse,
  type ServiceOnboardingStatus,
} from "@/services/service-onboarding-api";

const visibleStatuses: readonly ServiceOnboardingStatus[] = [
  "IN_PROGRESS",
  "READY_FOR_FINALIZATION",
  "ABANDONED",
];

export async function loadVisibleOnboardings(
  draftServiceIds: readonly string[],
): Promise<readonly ServiceOnboardingResponse[]> {
  // Isolate failures per draft: one stale/inaccessible service must not hide
  // progress for every other service in the catalog.
  const results = await Promise.allSettled(
    draftServiceIds.map((serviceId) => loadOnboardingOrNull(serviceId)),
  );
  return results.flatMap((result) => {
    if (result.status !== "fulfilled") {
      return [];
    }
    const onboarding = result.value;
    return onboarding !== null && visibleStatuses.includes(onboarding.status)
      ? [onboarding]
      : [];
  });
}

async function loadOnboardingOrNull(
  serviceId: string,
): Promise<ServiceOnboardingResponse | null> {
  try {
    return await getServiceOnboarding(serviceId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
