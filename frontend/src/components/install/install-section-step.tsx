import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallSectionField } from "@/components/install/install-section-field";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import {
  mapInstallContentSaveError,
  type InstallContentErrorKey,
} from "@/lib/install/map-install-content-save-error";
import {
  loadInstallSection,
  saveInstallSection,
  type InstallSettingsSectionKey,
  type InstallSettingsSectionStatus,
  type SettingValueLike,
} from "@/services/install-sections-api";

/*
  Install wizard v2 (F5): **one** step for every section of the Full package. The
  screen is assembled from the registry metadata the backend hands over — the
  fields, their titles, help texts and choices — so a new section needs no new
  component, no new copy and no new validation. What the step adds on top of the
  form is what the wizard alone knows: which keys it may write at all, what the
  operator has to have in place first, and that „sačuvaj“ is also the answer that
  lets the step go.
*/

type DraftValues = Readonly<Record<string, SettingValueLike | null>>;

export function InstallSectionStep({
  sectionKey,
  onSaved,
}: {
  readonly sectionKey: InstallSettingsSectionKey;
  readonly onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DraftValues | null>(null);
  const [status, setStatus] = useState<InstallSettingsSectionStatus | null>(null);
  const [errorKey, setErrorKey] = useState<InstallContentErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSeeded, setIsSeeded] = useState(false);
  const resource = useInstallStepResource(() => loadInstallSection(sectionKey));

  useEffect(() => {
    if (resource.status !== "ready" || isSeeded) {
      return;
    }
    setStatus(resource.data);
    setDraft(draftOf(resource.data));
    setIsSeeded(true);
  }, [isSeeded, resource]);

  if (resource.status === "loading" || draft === null) {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }

  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  const loaded = status ?? resource.data;
  const currentDraft = draft ?? draftOf(loaded);
  const pending = pendingValues(loaded, currentDraft);
  const unmetDependencies = loaded.dependencies.filter((entry) => !entry.satisfied);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const next = await saveInstallSection(sectionKey, pending);
      setStatus(next);
      setDraft(draftOf(next));
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallContentSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      {unmetDependencies.length > 0 ? (
        <p className={hintClassName}>
          {unmetDependencies
            .map((entry) => t(`install.section.requires.${entry.dependency}`))
            .join(" ")}
        </p>
      ) : null}
      <div className="grid gap-4">
        {loaded.fields.map((field) => (
          <InstallSectionField
            key={field.key}
            field={field}
            value={currentDraft[field.key] ?? null}
            isDisabled={isSubmitting}
            onChange={(next) =>
              setDraft((current) => ({ ...(current ?? currentDraft), [field.key]: next }))
            }
          />
        ))}
      </div>
      {errorKey !== null ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
      {loaded.answered && errorKey === null ? (
        <p className={hintClassName}>{t("install.section.saved")}</p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? t("install.section.saving")
            : pending.length === 0
              ? t("install.section.confirmDefaults")
              : t("install.section.save")}
        </Button>
      </div>
    </form>
  );
}

function draftOf(status: InstallSettingsSectionStatus): DraftValues {
  return Object.fromEntries(
    status.fields.map((field) => [
      field.key,
      // A stored secret stays „untouched“ until the operator types a new one.
      field.visibility === "secret" && field.isSet ? null : field.value,
    ]),
  );
}

/**
 * What the save carries: only the fields the operator actually changed. An empty
 * control means „leave it as it is“ — a wizard writes values, it does not clear
 * them (a mailbox address that is quietly emptied while e-mail intake stays on
 * would be a deployment that looks configured and is not). Clearing a value stays
 * a deliberate act on the Settings screen.
 */
function pendingValues(
  status: InstallSettingsSectionStatus,
  draft: DraftValues,
): readonly { readonly key: string; readonly value: SettingValueLike }[] {
  const original = new Map(status.fields.map((field) => [field.key, field] as const));
  const entries: { key: string; value: SettingValueLike }[] = [];
  for (const [key, value] of Object.entries(draft)) {
    const field = original.get(key);
    if (field === undefined || value === null || value === field.value) {
      continue;
    }
    entries.push({ key, value });
  }
  return entries;
}
