import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallSmtpFields } from "@/components/install/install-smtp-fields";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  buildInstallSmtpInput,
  isInstallSmtpFormReady,
  type InstallSmtpFormValues,
} from "@/lib/build-install-smtp-input";
import {
  mapInstallSmtpSaveError,
  type InstallSmtpErrorKey,
} from "@/lib/map-install-smtp-save-error";
import {
  loadInstallSmtp,
  saveInstallSmtp,
  type InstallSmtpRecord,
} from "@/services/install-smtp-api";

export function InstallSmtpStep() {
  const { t } = useTranslation();
  const [record, setRecord] = useState<InstallSmtpRecord | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [tls, setTls] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [errorKey, setErrorKey] = useState<InstallSmtpErrorKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    void loadInstallSmtp()
      .then((status) => {
        if (!isCancelled) {
          applyRecord(status.smtp);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  const formValues: InstallSmtpFormValues = {
    enabled,
    host,
    port,
    tls,
    username,
    password,
    fromAddress,
    passwordAlreadyConfigured: record?.passwordConfigured === true,
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isInstallSmtpFormReady(formValues)) {
      setErrorKey("install.smtp.errorIncomplete");
      return;
    }
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      applyRecord(await saveInstallSmtp(buildInstallSmtpInput(formValues)));
      setPassword("");
    } catch (error) {
      setErrorKey(mapInstallSmtpSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  function applyRecord(next: InstallSmtpRecord) {
    setRecord(next);
    setEnabled(next.enabled);
    setHost(next.host);
    setPort(String(next.port));
    setTls(next.tls);
    setUsername(next.username);
    setFromAddress(next.fromAddress);
  }

  if (isLoading) {
    return <div className="mt-6 h-40 animate-pulse bg-elevated" />;
  }

  return (
    <form className="mt-6 grid max-w-xl gap-3" onSubmit={onSubmit}>
      <label className="flex items-center gap-2 text-body">
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-label={t("install.smtp.enabled")}
        />
        {t("install.smtp.enabled")}
      </label>
      <p className="text-body leading-6 text-muted-foreground">
        {enabled ? t("install.smtp.onHint") : t("install.smtp.offHint")}
      </p>
      {enabled ? (
        <InstallSmtpFields
          host={host}
          port={port}
          tls={tls}
          username={username}
          password={password}
          fromAddress={fromAddress}
          passwordConfigured={record?.passwordConfigured === true}
          onHostChange={setHost}
          onPortChange={setPort}
          onTlsChange={setTls}
          onUsernameChange={setUsername}
          onPasswordChange={setPassword}
          onFromAddressChange={setFromAddress}
        />
      ) : null}
      {errorKey ? (
        <p className="text-body text-destructive">{t(errorKey)}</p>
      ) : null}
      <div>
        <Button
          type="submit"
          disabled={isSubmitting || !isInstallSmtpFormReady(formValues)}
        >
          {isSubmitting ? t("install.smtp.saving") : t("install.smtp.submit")}
        </Button>
      </div>
    </form>
  );
}
