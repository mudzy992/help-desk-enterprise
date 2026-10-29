import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useInstallSetup } from "@/app/install-setup-provider";
import {
  InstallReadinessList,
  MissingChecksList,
} from "@/components/install/install-readiness-checks";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  mapInstallCompleteError,
  readInstallCompleteMissingKeys,
  type InstallCompleteErrorKey,
} from "@/lib/map-install-complete-error";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import { completeInstallSetup } from "@/services/install-api";
import { loadInstallReadiness } from "@/services/install-profile-api";
import type { InstallStepKey } from "@/services/install-step-key";

/*
  Install wizard v2 (F6.1): the last screen before the end. It shows the same
  payload the finish is gated by (`GET /install/readiness`), in the order the
  backend declares: a red check names what is missing and — when a step can
  answer it — offers „Idi na korak“, and the finish button exists only while
  every check is green.

  The server stays the judge: a refusal (`INSTALL_NOT_READY`) is shown with the
  checks it names, and the readiness plus the wizard state are re-read, so the
  operator lands on the step that has to be finished instead of pressing a button
  that cannot work.
*/

export function InstallProvisioningStep({
  onFixStep,
}: {
  /**
   * F6.1: „Idi na korak“ — the page decides how the step is reopened (a deferred
   * step returns to the flow, an unanswered one opens as the step to answer).
   */
  readonly onFixStep: (stepKey: InstallStepKey) => void;
}) {
  const { t } = useTranslation();
  const setup = useInstallSetup();
  const resource = useInstallStepResource(() => loadInstallReadiness());
  const [errorKey, setErrorKey] = useState<InstallCompleteErrorKey | null>(null);
  const [missingKeys, setMissingKeys] = useState<readonly string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }
  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  const isReady = resource.data.isReady;
  const onFinish = async () => {
    setIsSubmitting(true);
    setErrorKey(null);
    setMissingKeys([]);
    try {
      await completeInstallSetup();
      // F6.2: the wizard renders „Sistem je spreman“ from here; its summary is the
      // one the status endpoint already delivered.
      setup.markCompleted();
    } catch (error) {
      setErrorKey(mapInstallCompleteError(error));
      const missing = readInstallCompleteMissingKeys(error);
      setMissingKeys(missing);
      if (missing.length > 0) {
        resource.retry();
        setup.reload();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-4">
      <p className={hintClassName}>
        {isReady ? t("install.provisioning.allGreen") : t("install.provisioning.checking")}
      </p>
      <InstallReadinessList checks={resource.data.checks} onFixStep={onFixStep} />
      {errorKey === null ? null : (
        <div role="alert" className="grid gap-1.5">
          <p className={errorTextClassName}>{t(errorKey)}</p>
          <MissingChecksList checkKeys={missingKeys} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={resource.retry}>
          {t("install.provisioning.recheck")}
        </Button>
        {isReady ? (
          <Button type="button" size="sm" disabled={isSubmitting} onClick={() => void onFinish()}>
            {isSubmitting ? t("install.provisioning.finishing") : t("install.provisioning.finish")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
