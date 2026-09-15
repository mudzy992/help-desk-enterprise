import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  APPROVALS_NOT_REQUIRED_REFERENCE,
  approvalsRequiredReference,
} from "@/services/service-onboarding-api";

interface OnboardingApprovalsStepProperties {
  readonly serviceId: string;
  readonly requiresApproval: boolean;
  readonly isSaving: boolean;
  readonly onContinue: (reference: string) => void;
  readonly onFinalize: () => void;
  readonly canFinalize: boolean;
}

export function OnboardingApprovalsStep({
  serviceId,
  requiresApproval,
  isSaving,
  onContinue,
  onFinalize,
  canFinalize,
}: OnboardingApprovalsStepProperties) {
  const { t } = useTranslation();
  const reference = requiresApproval
    ? approvalsRequiredReference(serviceId)
    : APPROVALS_NOT_REQUIRED_REFERENCE;
  return (
    <div className="grid max-w-xl gap-3">
      <p className="text-[12.5px] leading-5 text-muted-foreground">
        {t(
          requiresApproval
            ? "services.onboarding.approvalsRequired"
            : "services.onboarding.approvalsOptional",
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isSaving}
          onClick={() => onContinue(reference)}
        >
          {isSaving ? t("services.onboarding.saving") : t("services.onboarding.next")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isSaving || !canFinalize}
          onClick={onFinalize}
        >
          {isSaving ? t("services.onboarding.finalizing") : t("services.onboarding.finalize")}
        </Button>
      </div>
    </div>
  );
}
