import type { OnboardingServiceValues } from "@/components/services/onboarding/onboarding-service-step";
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
): Promise<ServiceOnboardingResponse> {
  if (record === null) {
    const created = await createServiceOnboarding({
      name: values.name,
      slug: values.slug,
      categoryId: values.categoryId,
      requiresApproval: values.requiresApproval,
    });
    await saveOnboardingServiceStep(created.serviceId, {
      name: values.name,
      categoryId: values.categoryId,
      requiresApproval: values.requiresApproval,
    });
    return completeOnboardingStep(created.serviceId, "SERVICE");
  }
  await saveOnboardingServiceStep(record.serviceId, {
    name: values.name,
    categoryId: values.categoryId,
    requiresApproval: values.requiresApproval,
  });
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
