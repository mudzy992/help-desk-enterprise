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
  onServiceLoaded?: (
    serviceId: string,
    onboarding: ServiceOnboardingResponse | null,
  ) => void,
): Promise<readonly ServiceOnboardingResponse[]> {
  // Isolate failures per draft and publish each completed read immediately:
  // one slow or inaccessible service must not delay every other progress chip.
  const results = await Promise.allSettled(
    draftServiceIds.map(async (serviceId) => {
      const onboarding = await loadOnboardingOrNull(serviceId);
      const visibleOnboarding =
        onboarding !== null && visibleStatuses.includes(onboarding.status)
          ? onboarding
          : null;
      onServiceLoaded?.(serviceId, visibleOnboarding);
      return visibleOnboarding;
    }),
  );
  return results.flatMap((result) =>
    result.status === "fulfilled" && result.value !== null ? [result.value] : [],
  );
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
