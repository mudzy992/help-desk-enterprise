import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallIdentityFields } from "@/components/install/install-identity-fields";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import type { LogoReadError } from "@/lib/branding/read-logo-file";
import {
  buildSaveInstallIdentityInput,
  isInstallIdentityFormReady,
  toInstallIdentityFormValues,
  toInstallIdentityPreview,
  type InstallIdentityFormValues,
} from "@/lib/install/install-identity-form";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import {
  mapInstallIdentitySaveError,
  type InstallIdentityErrorKey,
} from "@/lib/map-install-identity-save-error";
import { loadInstallIdentity, saveInstallIdentity } from "@/services/install-identity-api";

/**
 * F2 — "Identitet". The installation gets its name before anybody signs in: the
 * organisation, the product name, the language and the time zone, plus the brand
 * mark and the support contacts the operator may defer. The live panel shows the
 * brand as the sign-in page will show it — the same settings the public branding
 * endpoint reads.
 */
export function InstallIdentityStep({ onSaved }: { readonly onSaved?: () => void }) {
  const { t } = useTranslation();
  const [errorKey, setErrorKey] = useState<InstallIdentityErrorKey | null>(null);
  const [logoError, setLogoError] = useState<LogoReadError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draft, setDraft] = useState<InstallIdentityFormValues | null>(null);

  // F0.2/IN3: the form is only rendered once the stored identity was read — the
  // defaults must not overwrite what a previous session already configured.
  const resource = useInstallStepResource(loadInstallIdentity);

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }

  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  const values = draft ?? toInstallIdentityFormValues(resource.data.identity);
  const preview = toInstallIdentityPreview(values);

  const patch = (partial: Partial<InstallIdentityFormValues>) => {
    setDraft({ ...values, ...partial });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isInstallIdentityFormReady(values)) {
      setErrorKey("install.identity.errorInvalid");
      return;
    }
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const saved = await saveInstallIdentity(buildSaveInstallIdentityInput(values));
      setDraft(toInstallIdentityFormValues(saved));
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallIdentitySaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div
        className="flex items-center gap-3 rounded-lg border border-border bg-surface-hover px-4 py-3"
        aria-label={t("install.identity.preview")}
      >
        {preview.logoDataUrl.length > 0 ? (
          <img src={preview.logoDataUrl} alt="" className="size-9 rounded object-contain" />
        ) : null}
        <div>
          <p className="text-[13.5px] font-semibold text-foreground">{preview.appName}</p>
          <p className="text-[12px] text-muted-foreground">
            {preview.organizationName.length > 0
              ? preview.organizationName
              : t("install.identity.previewEmpty")}
          </p>
        </div>
      </div>
      <InstallIdentityFields
        values={values}
        logoError={logoError}
        onChange={patch}
        onLogoChange={(logoDataUrl) => patch({ logoDataUrl, logoConfigured: true })}
        onLogoError={setLogoError}
      />
      {errorKey ? (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting || !isInstallIdentityFormReady(values)}>
          {isSubmitting ? t("install.identity.saving") : t("install.identity.submit")}
        </Button>
      </div>
    </form>
  );
}
