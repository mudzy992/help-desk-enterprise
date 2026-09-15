import { ApiError } from "@/services/api";
import { getService, type ServiceResponse } from "@/services/service-catalog-api";
import {
  getServiceOnboarding,
  resumeServiceOnboarding,
  startServiceOnboarding,
  type ServiceOnboardingResponse,
} from "@/services/service-onboarding-api";

export async function loadOrStartOnboarding(serviceId: string): Promise<{
  readonly record: ServiceOnboardingResponse;
  readonly service: ServiceResponse;
}> {
  let record: ServiceOnboardingResponse;
  try {
    record = await getServiceOnboarding(serviceId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) {
      throw error;
    }
    record = await startServiceOnboarding(serviceId);
  }
  if (record.status === "ABANDONED") {
    record = await resumeServiceOnboarding(serviceId);
  }
  return { record, service: await getService(serviceId) };
}
