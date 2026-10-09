import { useTranslation } from "react-i18next";
import { ServiceFormBuilder } from "@/components/services/form-builder/service-form-builder";
import { Button } from "@/components/ui/button";

interface OnboardingFormStepProperties {
  readonly serviceId: string;
  readonly canWrite: boolean;
  readonly activeFormVersionRef: string | null;
  readonly isSaving: boolean;
  readonly onActiveVersion: (formVersionRef: string | null) => void;
  readonly onContinue: () => void;
}

export function OnboardingFormStep({
  serviceId,
  canWrite,
  activeFormVersionRef,
  isSaving,
  onActiveVersion,
  onContinue,
}: OnboardingFormStepProperties) {
  const { t } = useTranslation();
  return (
    <div className="fade-in grid w-full gap-5">
      <ServiceFormBuilder
        serviceId={serviceId}
        canWrite={canWrite}
        onActiveVersion={onActiveVersion}
      />
      <Button
        type="button"
        size="sm"
        className="justify-self-start"
        disabled={isSaving || activeFormVersionRef === null}
        onClick={onContinue}
      >
        {isSaving ? t("services.onboarding.saving") : t("services.onboarding.next")}
      </Button>
    </div>
  );
}
