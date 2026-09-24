import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";

interface OnboardingRoutingStepProperties {
  readonly suggestion: string | null;
  readonly isSaving: boolean;
  readonly onConfirm: (reference: string) => void;
  readonly onReload: () => void;
}

export function OnboardingRoutingStep({
  suggestion,
  isSaving,
  onConfirm,
  onReload,
}: OnboardingRoutingStepProperties) {
  const { t } = useTranslation();
  if (suggestion === null) {
    return (
      <div className="fade-in grid gap-3">
        <p className="rounded-lg border border-warning/30 bg-warning/6 px-3 py-2 text-[11.5px] leading-[15px] text-foreground/90">
          {t("services.onboarding.routingCoverageWarning")}
        </p>
        <EmptyState
          title={t("services.onboarding.routingMissing")}
          action={
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" asChild>
                <Link to="/routing">{t("services.onboarding.routingOpen")}</Link>
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onReload}>
                {t("services.onboarding.next")}
              </Button>
            </div>
          }
        />
      </div>
    );
  }
  return (
    <div className="fade-in grid max-w-xl gap-3">
      <Field label={t("services.onboarding.routingSuggestion")}>
        <Input value={suggestion} readOnly />
      </Field>
      <Button
        type="button"
        size="sm"
        disabled={isSaving}
        onClick={() => onConfirm(suggestion)}
      >
        {isSaving ? t("services.onboarding.saving") : t("services.onboarding.routingConfirm")}
      </Button>
    </div>
  );
}
