import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInstallSetup } from "@/app/install-setup-provider";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import {
  mapInstallCompleteError,
  type InstallCompleteErrorKey,
} from "@/lib/map-install-complete-error";
import { completeInstallSetup } from "@/services/install-api";

export function InstallCompleteStep() {
  const { t } = useTranslation();
  const { markCompleted } = useInstallSetup();
  const [errorKey, setErrorKey] = useState<InstallCompleteErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await completeInstallSetup();
      markCompleted();
    } catch (error) {
      setErrorKey(mapInstallCompleteError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="mt-6 grid max-w-xl gap-3" onSubmit={(event) => void onSubmit(event)}>
      {errorKey ? (
        <p className={errorTextClassName}>{t(errorKey)}</p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("install.complete.saving") : t("install.complete.submit")}
        </Button>
      </div>
    </form>
  );
}
