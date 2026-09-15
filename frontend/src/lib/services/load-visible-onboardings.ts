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
  const results = await Promise.all(
    draftServiceIds.map((serviceId) => loadOnboardingOrNull(serviceId)),
  );
  return results.filter(
    (item): item is ServiceOnboardingResponse =>
      item !== null && visibleStatuses.includes(item.status),
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
