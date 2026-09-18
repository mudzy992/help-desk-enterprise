import { apiRequest } from "@/services/api";
import type { CreateServiceInput, ServiceLifecycle } from "@/services/service-catalog-api";

export const SERVICE_ONBOARDING_STEPS = [
  "SERVICE",
  "FORM",
  "ROUTING",
  "SLA",
  "APPROVALS",
] as const;

export type ServiceOnboardingStep = (typeof SERVICE_ONBOARDING_STEPS)[number];

export type ServiceOnboardingStatus =
  | "IN_PROGRESS"
  | "READY_FOR_FINALIZATION"
  | "COMPLETED"
  | "ABANDONED";

export type ServiceOnboardingValidationIssue = {
  readonly code: string;
  readonly step?: ServiceOnboardingStep;
};

export type ServiceOnboardingResponse = {
  readonly id: string;
  readonly serviceId: string;
  readonly status: ServiceOnboardingStatus;
  readonly currentStep: ServiceOnboardingStep;
  readonly completedSteps: readonly ServiceOnboardingStep[];
  readonly formVersionRef: string | null;
  readonly routingConfigurationRef: string | null;
  readonly slaConfigurationRef: string | null;
  readonly approvalsConfigurationRef: string | null;
  readonly routingSuggestion: string | null;
  readonly lastValidationErrors: readonly ServiceOnboardingValidationIssue[];
  readonly serviceLifecycle: ServiceLifecycle;
  readonly warnings?: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export const APPROVALS_NOT_REQUIRED_REFERENCE = "not_required";

export function routingConfigurationReference(serviceId: string): string {
  return `routing:${serviceId}`;
}

export function approvalsRequiredReference(serviceId: string): string {
  return `approvals:${serviceId}`;
}

export function createServiceOnboarding(
  input: CreateServiceInput,
): Promise<ServiceOnboardingResponse> {
  return apiRequest("/services/onboarding", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function startServiceOnboarding(
  serviceId: string,
): Promise<ServiceOnboardingResponse> {
  return apiRequest(`/services/${serviceId}/onboarding`, { method: "POST" });
}

export function getServiceOnboarding(
  serviceId: string,
): Promise<ServiceOnboardingResponse> {
  return apiRequest(`/services/${serviceId}/onboarding`);
}

export function saveOnboardingServiceStep(
  serviceId: string,
  input: {
    readonly name?: string;
    readonly categoryId?: string;
    readonly requiresApproval?: boolean;
  },
): Promise<ServiceOnboardingResponse> {
  return apiRequest(`/services/${serviceId}/onboarding/service`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function saveOnboardingFormStep(
  serviceId: string,
  formVersionRef: string,
): Promise<ServiceOnboardingResponse> {
  return apiRequest(`/services/${serviceId}/onboarding/form`, {
    method: "PATCH",
    body: JSON.stringify({ formVersionRef }),
  });
}

export function saveOnboardingRoutingStep(
  serviceId: string,
  routingConfigurationRef: string,
): Promise<ServiceOnboardingResponse> {
  return apiRequest(`/services/${serviceId}/onboarding/routing`, {
    method: "PATCH",
    body: JSON.stringify({ routingConfigurationRef }),
  });
}

export function saveOnboardingSlaStep(
  serviceId: string,
  slaConfigurationRef: string,
): Promise<ServiceOnboardingResponse> {
  return apiRequest(`/services/${serviceId}/onboarding/sla`, {
    method: "PATCH",
    body: JSON.stringify({ slaConfigurationRef }),
  });
}

export function saveOnboardingApprovalsStep(
  serviceId: string,
  approvalsConfigurationRef: string,
): Promise<ServiceOnboardingResponse> {
  return apiRequest(`/services/${serviceId}/onboarding/approvals`, {
    method: "PATCH",
    body: JSON.stringify({ approvalsConfigurationRef }),
  });
}

export function completeOnboardingStep(
  serviceId: string,
  step: ServiceOnboardingStep,
): Promise<ServiceOnboardingResponse> {
  const path = step.toLowerCase();
  return apiRequest(`/services/${serviceId}/onboarding/steps/${path}/complete`, {
    method: "POST",
  });
}

export function finalizeServiceOnboarding(
  serviceId: string,
): Promise<ServiceOnboardingResponse> {
  return apiRequest(`/services/${serviceId}/onboarding/finalize`, {
    method: "POST",
  });
}

export function abandonServiceOnboarding(
  serviceId: string,
): Promise<ServiceOnboardingResponse> {
  return apiRequest(`/services/${serviceId}/onboarding/abandon`, {
    method: "POST",
  });
}

export function resumeServiceOnboarding(
  serviceId: string,
): Promise<ServiceOnboardingResponse> {
  return apiRequest(`/services/${serviceId}/onboarding/resume`, {
    method: "POST",
  });
}
