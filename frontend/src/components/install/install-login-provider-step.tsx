import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  InstallEntraAdFields,
  isEntraConfigured,
} from "@/components/install/install-entra-ad-fields";
import {
  InstallLdapsBindFields,
  isDirectoryBindConfigured,
} from "@/components/install/install-ldaps-bind-fields";
import { Button } from "@/components/ui/button";
import {
  buildInstallLoginProviderInput,
  isInstallLoginProviderFormReady,
  type InstallLoginProviderFormValues,
} from "@/lib/build-install-login-provider-input";
import {
  mapInstallLoginProviderSaveError,
  type InstallLoginProviderErrorKey,
} from "@/lib/map-install-login-provider-save-error";
import {
  loadInstallLoginProvider,
  saveInstallLoginProvider,
  type InstallLoginProviderMode,
  type InstallLoginProviderRecord,
} from "@/services/install-api";

export function InstallLoginProviderStep() {
  const { t } = useTranslation();
  const [record, setRecord] = useState<InstallLoginProviderRecord | null>(null);
  const [mode, setMode] = useState<InstallLoginProviderMode>("local");
  const [azureTenantId, setAzureTenantId] = useState("");
  const [azureClientId, setAzureClientId] = useState("");
  const [adLdapsUrlsCsv, setAdLdapsUrlsCsv] = useState("");
  const [adBindDn, setAdBindDn] = useState("");
  const [adBindPassword, setAdBindPassword] = useState("");
  const [errorKey, setErrorKey] =
    useState<InstallLoginProviderErrorKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    void loadInstallLoginProvider()
      .then((status) => {
        if (!isCancelled) {
          applyRecord(status.loginProvider);
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

  const formValues: InstallLoginProviderFormValues = {
    mode,
    azureTenantId,
    azureClientId,
    adLdapsUrlsCsv,
    adBindDn,
    adBindPassword,
    entraAlreadyConfigured: record !== null && isEntraConfigured(record),
    directoryBindAlreadyConfigured:
      record !== null && isDirectoryBindConfigured(record),
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isInstallLoginProviderFormReady(formValues)) {
      setErrorKey("install.loginProvider.errorIncomplete");
      return;
    }
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const saved = await saveInstallLoginProvider(
        buildInstallLoginProviderInput(formValues),
      );
      applyRecord(saved);
      setAzureTenantId("");
      setAzureClientId("");
      setAdBindDn("");
      setAdBindPassword("");
    } catch (error) {
      setErrorKey(mapInstallLoginProviderSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  function applyRecord(next: InstallLoginProviderRecord) {
    setRecord(next);
    setMode(next.mode);
    setAdLdapsUrlsCsv(next.directoryBind.urls);
  }

  if (isLoading) {
    return <div className="mt-6 h-40 animate-pulse bg-elevated" />;
  }

  return (
    <form className="mt-6 grid max-w-xl gap-3" onSubmit={onSubmit}>
      <fieldset className="grid gap-2">
        <legend className="text-body font-medium text-foreground">
          {t("install.loginProvider.mode")}
        </legend>
        <label className="flex items-center gap-2 text-body">
          <input
            type="radio"
            name="login-provider-mode"
            value="local"
            checked={mode === "local"}
            onChange={() => setMode("local")}
          />
          {t("install.loginProvider.local")}
        </label>
        <label className="flex items-center gap-2 text-body">
          <input
            type="radio"
            name="login-provider-mode"
            value="entra_ad"
            checked={mode === "entra_ad"}
            onChange={() => setMode("entra_ad")}
          />
          {t("install.loginProvider.entraAd")}
        </label>
      </fieldset>
      {mode === "local" ? (
        <p className="text-body leading-6 text-muted-foreground">
          {t("install.loginProvider.localHint")}
        </p>
      ) : (
        <>
          <p className="text-body leading-6 text-muted-foreground">
            {t("install.loginProvider.entraHint")}
          </p>
          <InstallEntraAdFields
            tenantId={azureTenantId}
            clientId={azureClientId}
            tenantIdConfigured={record?.entra.tenantIdConfigured === true}
            clientIdConfigured={record?.entra.clientIdConfigured === true}
            tenantIdLabel={t("install.loginProvider.azureTenantId")}
            clientIdLabel={t("install.loginProvider.azureClientId")}
            configuredLabel={t("install.loginProvider.configured")}
            onTenantIdChange={setAzureTenantId}
            onClientIdChange={setAzureClientId}
          />
          <InstallLdapsBindFields
            urls={adLdapsUrlsCsv}
            bindDn={adBindDn}
            bindPassword={adBindPassword}
            bindDnConfigured={record?.directoryBind.bindDnConfigured === true}
            bindPasswordConfigured={
              record?.directoryBind.bindPasswordConfigured === true
            }
            urlsLabel={t("install.loginProvider.ldapsUrls")}
            bindDnLabel={t("install.loginProvider.bindDn")}
            bindPasswordLabel={t("install.loginProvider.bindPassword")}
            configuredLabel={t("install.loginProvider.configured")}
            onUrlsChange={setAdLdapsUrlsCsv}
            onBindDnChange={setAdBindDn}
            onBindPasswordChange={setAdBindPassword}
          />
          <p className="text-body text-muted-foreground">
            {t("install.loginProvider.breakGlass")}
          </p>
        </>
      )}
      {errorKey ? (
        <p className="text-body text-destructive">{t(errorKey)}</p>
      ) : null}
      <div>
        <Button
          type="submit"
          disabled={isSubmitting || !isInstallLoginProviderFormReady(formValues)}
        >
          {isSubmitting
            ? t("install.loginProvider.saving")
            : t("install.loginProvider.submit")}
        </Button>
      </div>
    </form>
  );
}
