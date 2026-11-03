import type { OnboardingServiceValues } from "@/lib/services/onboarding-service-values";
import { getService } from "@/services/service-catalog-api";
import {
  completeOnboardingStep,
  createServiceOnboarding,
  saveOnboardingApprovalsStep,
  saveOnboardingFormStep,
  saveOnboardingRoutingStep,
  saveOnboardingServiceStep,
  saveOnboardingSlaStep,
  type ServiceOnboardingResponse,
} from "@/services/service-onboarding-api";

export async function completeServiceOnboardingStep(
  record: ServiceOnboardingResponse | null,
  values: OnboardingServiceValues,
  options?: {
    readonly initialReason?: string;
    readonly onCreated?: (record: ServiceOnboardingResponse) => void;
    readonly serviceRevision?: number;
  },
): Promise<ServiceOnboardingResponse> {
  const input = {
    name: values.name,
    categoryId: values.categoryId,
    requiresApproval: values.requiresApproval,
  };
  if (record === null) {
    const created = await createServiceOnboarding({
      ...input,
      slug: values.slug,
      reason: options?.initialReason ?? "Service onboarding: initial service record",
    });
    options?.onCreated?.(created);
    const service = await getService(created.serviceId);
    await saveOnboardingServiceStep(created.serviceId, input, service.revision);
    return completeOnboardingStep(created.serviceId, "SERVICE");
  }
  const serviceRevision = options?.serviceRevision ?? (await getService(record.serviceId)).revision;
  await saveOnboardingServiceStep(record.serviceId, input, serviceRevision);
  return completeOnboardingStep(record.serviceId, "SERVICE");
}

export async function completeNamedOnboardingStep(
  serviceId: string,
  kind: "FORM" | "ROUTING" | "SLA" | "APPROVALS",
  reference: string,
): Promise<ServiceOnboardingResponse> {
  if (kind === "FORM") {
    await saveOnboardingFormStep(serviceId, reference);
  } else if (kind === "ROUTING") {
    await saveOnboardingRoutingStep(serviceId, reference);
  } else if (kind === "SLA") {
    await saveOnboardingSlaStep(serviceId, reference);
  } else {
    await saveOnboardingApprovalsStep(serviceId, reference);
  }
  return completeOnboardingStep(serviceId, kind);
}
