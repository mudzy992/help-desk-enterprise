import { useTranslation } from "react-i18next";
import { WizardStepper } from "@/components/ui/wizard-stepper";
import { SERVICE_ONBOARDING_STEPS } from "@/services/service-onboarding-api";

interface ServiceOnboardingStepperProperties {
  readonly activeIndex: number;
}

export function ServiceOnboardingStepper({
  activeIndex,
}: ServiceOnboardingStepperProperties) {
  const { t } = useTranslation();
  return (
    <WizardStepper
      activeIndex={activeIndex}
      steps={SERVICE_ONBOARDING_STEPS.map((key) => ({
        key,
        label: t(`services.onboarding.steps.${key}`),
      }))}
    />
  );
}
