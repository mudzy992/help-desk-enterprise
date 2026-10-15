import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Minus } from "lucide-react";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import { resolveTranslation } from "@/lib/settings/resolve-registry-i18n";
import {
  mapInstallContentSaveError,
  type InstallContentErrorKey,
} from "@/lib/install/map-install-content-save-error";
import {
  applyInstallSecurityRecommendations,
  loadInstallSecurityRecommendations,
  type InstallSecurityRecommendationsStatus,
} from "@/services/install-sections-api";

/*
  Install wizard v2 (F5) + owner decision 7: „Preporučeno za produkciju“. The
  panel states what the deployment is missing and offers one action that writes
  the agreed values — nothing else. The captcha line is a statement, not a task:
  switching it on without Turnstile keys would lock everybody out of the sign-in
  page, so the wizard leaves it to the operator (and to the Settings screen).
*/

export function InstallSecurityRecommendations({ onSaved }: { readonly onSaved?: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<InstallSecurityRecommendationsStatus | null>(null);
  const [errorKey, setErrorKey] = useState<InstallContentErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const resource = useInstallStepResource(loadInstallSecurityRecommendations);

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }

  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  const current = status ?? resource.data;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      setStatus(await applyInstallSecurityRecommendations());
      setIsApplied(true);
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallContentSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <ul className="grid gap-3">
        {current.recommendations.map((entry) => (
          <li key={entry.key} className="flex items-start justify-between gap-4">
            <div className="grid gap-0.5">
              <span className="text-[12.5px] font-medium text-foreground">
                {resolveTranslation(t, entry.titleKey) ?? entry.key}
              </span>
              <span className={hintClassName}>{resolveTranslation(t, entry.helpKey) ?? ""}</span>
            </div>
            <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              {entry.isApplied ? (
                <Check className="size-3.5 text-ok" aria-hidden="true" />
              ) : (
                <Minus className="size-3.5" aria-hidden="true" />
              )}
              {entry.isApplied
                ? t("install.security.recommendations.applied")
                : entry.recommendedValue === null
                  ? t("install.security.recommendations.manual")
                  : t("install.security.recommendations.pending")}
            </span>
          </li>
        ))}
      </ul>
      {errorKey !== null ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
      {isApplied && errorKey === null ? (
        <p className={hintClassName}>{t("install.security.recommendations.done")}</p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !current.canApply}>
          {isSubmitting
            ? t("install.security.recommendations.saving")
            : t("install.security.recommendations.submit")}
        </Button>
      </div>
    </form>
  );
}
