import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallEntraAdFields } from "@/components/install/install-entra-ad-fields";
import { InstallLdapsBindFields } from "@/components/install/install-ldaps-bind-fields";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  buildInstallLoginProviderInput,
  isInstallLoginProviderFormReady,
  toInstallLoginProviderFormValues,
  type InstallLoginProviderFormValues,
} from "@/lib/build-install-login-provider-input";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import {
  mapInstallLoginProviderSaveError,
  type InstallLoginProviderErrorKey,
} from "@/lib/map-install-login-provider-save-error";
import {
  loadInstallLoginProvider,
  saveInstallLoginProvider,
  type InstallLoginProviderRecord,
} from "@/services/install-api";

export function InstallLoginProviderStep({ onSaved }: { readonly onSaved?: () => void }) {
  const { t } = useTranslation();
  const [errorKey, setErrorKey] = useState<InstallLoginProviderErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState<InstallLoginProviderFormValues | null>(null);

  // F0.2/IN3: without the stored answer the form would start on `local` — a
  // failed load could then switch a working Entra AD sign-in back to local
  // accounts. The form is therefore rendered from `ready` only.
  const resource = useInstallStepResource(loadInstallLoginProvider);

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }

  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  const values = draft ?? toInstallLoginProviderFormValues(resource.data.loginProvider);

  const patch = (partial: Partial<InstallLoginProviderFormValues>) => {
    setDraft({ ...values, ...partial });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isInstallLoginProviderFormReady(values)) {
      setErrorKey("install.loginProvider.errorIncomplete");
      return;
    }
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const saved: InstallLoginProviderRecord = await saveInstallLoginProvider(
        buildInstallLoginProviderInput(values),
      );
      setDraft(toInstallLoginProviderFormValues(saved));
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallLoginProviderSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <fieldset className="grid gap-2">
        <legend className="text-[12.5px] font-medium text-foreground">
          {t("install.loginProvider.mode")}
        </legend>
        <label className="flex items-center gap-2 text-[13px] text-foreground">
          <input
            type="radio"
            name="login-provider-mode"
            value="local"
            checked={values.mode === "local"}
            onChange={() => patch({ mode: "local" })}
          />
          {t("install.loginProvider.local")}
        </label>
        <label className="flex items-center gap-2 text-[13px] text-foreground">
          <input
            type="radio"
            name="login-provider-mode"
            value="entra_ad"
            checked={values.mode === "entra_ad"}
            onChange={() => patch({ mode: "entra_ad" })}
          />
          {t("install.loginProvider.entraAd")}
        </label>
      </fieldset>
      {values.mode === "local" ? (
        <p className="text-[12.5px] leading-5 text-muted-foreground">
          {t("install.loginProvider.localHint")}
        </p>
      ) : (
        <>
          <p className="text-[12.5px] leading-5 text-muted-foreground">
            {t("install.loginProvider.entraHint")}
          </p>
          <InstallEntraAdFields
            tenantId={values.azureTenantId}
            clientId={values.azureClientId}
            tenantIdConfigured={values.entraAlreadyConfigured}
            clientIdConfigured={values.entraAlreadyConfigured}
            tenantIdLabel={t("install.loginProvider.azureTenantId")}
            clientIdLabel={t("install.loginProvider.azureClientId")}
            configuredLabel={t("install.loginProvider.configured")}
            onTenantIdChange={(azureTenantId) => patch({ azureTenantId })}
            onClientIdChange={(azureClientId) => patch({ azureClientId })}
          />
          <InstallLdapsBindFields
            urls={values.adLdapsUrlsCsv}
            bindDn={values.adBindDn}
            bindPassword={values.adBindPassword}
            bindDnConfigured={values.directoryBindAlreadyConfigured}
            bindPasswordConfigured={values.directoryBindAlreadyConfigured}
            urlsLabel={t("install.loginProvider.ldapsUrls")}
            bindDnLabel={t("install.loginProvider.bindDn")}
            bindPasswordLabel={t("install.loginProvider.bindPassword")}
            configuredLabel={t("install.loginProvider.configured")}
            onUrlsChange={(adLdapsUrlsCsv) => patch({ adLdapsUrlsCsv })}
            onBindDnChange={(adBindDn) => patch({ adBindDn })}
            onBindPasswordChange={(adBindPassword) => patch({ adBindPassword })}
          />
          <p className="text-[12.5px] text-muted-foreground">
            {t("install.loginProvider.breakGlass")}
          </p>
        </>
      )}
      {errorKey ? (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting || !isInstallLoginProviderFormReady(values)}>
          {isSubmitting ? t("install.loginProvider.saving") : t("install.loginProvider.submit")}
        </Button>
      </div>
    </form>
  );
}
