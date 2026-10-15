import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallSmtpFields } from "@/components/install/install-smtp-fields";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  buildInstallSmtpInput,
  isInstallSmtpFormReady,
  toInstallSmtpFormValues,
  type InstallSmtpFormValues,
} from "@/lib/build-install-smtp-input";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import {
  mapInstallSmtpSaveError,
  type InstallSmtpErrorKey,
} from "@/lib/map-install-smtp-save-error";
import {
  loadInstallSmtp,
  saveInstallSmtp,
  type InstallSmtpRecord,
} from "@/services/install-smtp-api";

type SmtpDraft = {
  readonly values: InstallSmtpFormValues;
  readonly passwordConfigured: boolean;
};

export function InstallSmtpStep({ onSaved }: { readonly onSaved?: () => void }) {
  const { t } = useTranslation();
  const [errorKey, setErrorKey] = useState<InstallSmtpErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState<SmtpDraft | null>(null);

  // F0.2/IN3: the form exists only once the stored state was read — rendering it
  // from defaults would let a failed load save `enabled=false` over a working
  // SMTP configuration.
  const resource = useInstallStepResource(loadInstallSmtp);

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }

  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  const { values, passwordConfigured } = draft ?? toDraft(resource.data.smtp);

  const patch = (partial: Partial<InstallSmtpFormValues>) => {
    setDraft({ values: { ...values, ...partial }, passwordConfigured });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isInstallSmtpFormReady(values)) {
      setErrorKey("install.smtp.errorIncomplete");
      return;
    }
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      setDraft(toDraft(await saveInstallSmtp(buildInstallSmtpInput(values))));
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallSmtpSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <label className="flex items-center gap-2 text-body">
        <Switch
          checked={values.enabled}
          onCheckedChange={(enabled) => patch({ enabled })}
          aria-label={t("install.smtp.enabled")}
        />
        {t("install.smtp.enabled")}
      </label>
      <p className="text-body leading-6 text-muted-foreground">
        {values.enabled ? t("install.smtp.onHint") : t("install.smtp.offHint")}
      </p>
      {values.enabled ? (
        <InstallSmtpFields
          host={values.host}
          port={values.port}
          tls={values.tls}
          username={values.username}
          password={values.password}
          fromAddress={values.fromAddress}
          passwordConfigured={passwordConfigured}
          onHostChange={(host) => patch({ host })}
          onPortChange={(port) => patch({ port })}
          onTlsChange={(tls) => patch({ tls })}
          onUsernameChange={(username) => patch({ username })}
          onPasswordChange={(password) => patch({ password })}
          onFromAddressChange={(fromAddress) => patch({ fromAddress })}
        />
      ) : null}
      {errorKey ? (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting || !isInstallSmtpFormReady(values)}>
          {isSubmitting ? t("install.smtp.saving") : t("install.smtp.submit")}
        </Button>
      </div>
    </form>
  );
}

function toDraft(record: InstallSmtpRecord): SmtpDraft {
  return {
    values: toInstallSmtpFormValues(record),
    passwordConfigured: record.passwordConfigured,
  };
}
