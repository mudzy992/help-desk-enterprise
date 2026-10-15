import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInstallSetup } from "@/app/install-setup-provider";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { installReadinessMessageKey } from "@/lib/install/install-readiness-copy";
import {
  mapInstallCompleteError,
  readInstallCompleteMissingKeys,
  type InstallCompleteErrorKey,
} from "@/lib/map-install-complete-error";
import { completeInstallSetup } from "@/services/install-api";

export function InstallCompleteStep() {
  const { t } = useTranslation();
  const { markCompleted, reload } = useInstallSetup();
  const [errorKey, setErrorKey] = useState<InstallCompleteErrorKey | null>(null);
  const [missingKeys, setMissingKeys] = useState<readonly string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    setMissingKeys([]);
    try {
      await completeInstallSetup();
      markCompleted();
    } catch (error) {
      setErrorKey(mapInstallCompleteError(error));
      // F0.7: name what is still missing, and refresh the status so the wizard
      // shows the step that has to be finished instead of this screen.
      const missing = readInstallCompleteMissingKeys(error);
      setMissingKeys(missing);
      if (missing.length > 0) reload();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
      {errorKey ? (
        <div role="alert" className="grid gap-1.5">
          <p className={errorTextClassName}>{t(errorKey)}</p>
          {missingKeys.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4 text-[12px] leading-5 text-muted-foreground">
              {missingKeys.map((checkKey) => {
                const messageKey = installReadinessMessageKey(checkKey);
                return <li key={checkKey}>{messageKey === null ? checkKey : t(messageKey)}</li>;
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("install.complete.saving") : t("install.complete.submit")}
        </Button>
      </div>
    </form>
  );
}
