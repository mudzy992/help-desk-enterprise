import { OnboardingApprovalsStep } from "@/components/services/onboarding/onboarding-approvals-step";
import { OnboardingFormStep } from "@/components/services/onboarding/onboarding-form-step";
import { OnboardingRoutingStep } from "@/components/services/onboarding/onboarding-routing-step";
import {
  OnboardingServiceStep,
  type OnboardingServiceValues,
} from "@/components/services/onboarding/onboarding-service-step";
import { OnboardingSlaStep } from "@/components/services/onboarding/onboarding-sla-step";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";
import type { ServiceResponse } from "@/services/service-catalog-api";
import type { ServiceOnboardingResponse } from "@/services/service-onboarding-api";
import type { SlaProfile } from "@/services/sla-types";

interface OnboardingWizardStepsProperties {
  readonly record: ServiceOnboardingResponse | null;
  readonly service: ServiceResponse | null;
  readonly categories: readonly ServiceCategoryResponse[];
  readonly profiles: readonly SlaProfile[];
  readonly activeFormRef: string | null;
  readonly canWriteForms: boolean;
  readonly isSaving: boolean;
  readonly canFinalize: boolean;
  readonly onActiveVersion: (formVersionRef: string | null) => void;
  readonly onService: (values: OnboardingServiceValues) => void;
  readonly onForm: (formVersionRef: string) => void;
  readonly onRouting: (reference: string) => void;
  readonly onReloadRouting: () => void;
  readonly onSla: (slaProfileId: string) => void;
  readonly onApprovals: (reference: string) => void;
  readonly onFinalize: () => void;
}

export function OnboardingWizardSteps({
  record,
  service,
  categories,
  profiles,
  activeFormRef,
  canWriteForms,
  isSaving,
  canFinalize,
  onActiveVersion,
  onService,
  onForm,
  onRouting,
  onSla,
  onApprovals,
  onFinalize,
  onReloadRouting,
}: OnboardingWizardStepsProperties) {
  const step = record?.currentStep ?? "SERVICE";
  if (step === "SERVICE") {
    return (
      <OnboardingServiceStep
        key={service?.id ?? "new"}
        service={service}
        categories={categories}
        isSaving={isSaving}
        onSubmit={onService}
      />
    );
  }
  if (step === "FORM" && record) {
    return (
      <OnboardingFormStep
        serviceId={record.serviceId}
        canWrite={canWriteForms}
        activeFormVersionRef={activeFormRef}
        isSaving={isSaving}
        onActiveVersion={onActiveVersion}
        onContinue={() => {
          if (activeFormRef !== null) {
            onForm(activeFormRef);
          }
        }}
      />
    );
  }
  if (step === "ROUTING" && record) {
    return (
      <OnboardingRoutingStep
        suggestion={record.routingSuggestion}
        isSaving={isSaving}
        onConfirm={onRouting}
        onReload={onReloadRouting}
      />
    );
  }
  if (step === "SLA" && record) {
    return (
      <OnboardingSlaStep
        profiles={profiles}
        selectedId={record.slaConfigurationRef ?? ""}
        isSaving={isSaving}
        onContinue={onSla}
      />
    );
  }
  if (step === "APPROVALS" && record && service) {
    return (
      <OnboardingApprovalsStep
        serviceId={record.serviceId}
        requiresApproval={service.requiresApproval}
        isSaving={isSaving}
        canFinalize={canFinalize}
        onContinue={onApprovals}
        onFinalize={onFinalize}
      />
    );
  }
  return null;
}
