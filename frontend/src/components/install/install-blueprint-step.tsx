import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallBlueprintTree } from "@/components/install/install-blueprint-tree";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import {
  mapInstallContentSaveError,
  type InstallContentErrorKey,
} from "@/lib/install/map-install-content-save-error";
import {
  applyInstallBlueprint,
  loadInstallBlueprints,
  type InstallBlueprint,
  type InstallBlueprintLocale,
} from "@/services/install-content-api";
import { resolveInstallLocale } from "@/lib/install/resolve-install-locale";

/*
  Install wizard v2 (F4.2): „Sadržaj za standardni paket“ — pick a template, leave
  out what the organization does not need, watch what it will create, apply it.
  The step writes no routing of its own: the backend asserts EXACT routing before
  it commits, and a failure here means nothing was written.
*/

export function InstallBlueprintStep({ onSaved }: { readonly onSaved?: () => void }) {
  const { t, i18n } = useTranslation();
  const locale: InstallBlueprintLocale = resolveInstallLocale(i18n.language);
  const [blueprintKey, setBlueprintKey] = useState<string | null>(null);
  const [selectedServiceKeys, setSelectedServiceKeys] = useState<readonly string[]>([]);
  const [createTierGroups, setCreateTierGroups] = useState(false);
  const [errorKey, setErrorKey] = useState<InstallContentErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  // Seeded once from the loaded catalog: an effect that re-ran on every render
  // would reset the template the operator just applied.
  const [isSeeded, setIsSeeded] = useState(false);

  const resource = useInstallStepResource(
    useCallback(() => loadInstallBlueprints(locale), [locale]),
  );

  useEffect(() => {
    if (resource.status !== "ready" || isSeeded) {
      return;
    }
    const first = resource.data.blueprints[0];
    setApplied(resource.data.applied);
    if (first !== undefined) {
      setBlueprintKey(first.key);
      setSelectedServiceKeys(
        first.categories.flatMap((category) => category.services.map((s) => s.key)),
      );
    }
    setIsSeeded(true);
  }, [isSeeded, resource]);

  const selectBlueprint = (blueprint: InstallBlueprint) => {
    setBlueprintKey(blueprint.key);
    setSelectedServiceKeys(
      blueprint.categories.flatMap((category) => category.services.map((s) => s.key)),
    );
    setErrorKey(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blueprintKey === null) {
      return;
    }
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const result = await applyInstallBlueprint({
        blueprintKey,
        includeServices: selectedServiceKeys,
        createTierGroups,
        locale,
      });
      setApplied(result.blueprintKey);
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallContentSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (resource.status === "loading") {
    return <PanelSkeleton className="mt-0" label={t("install.loading")} />;
  }

  if (resource.status === "error") {
    return <InstallStepLoadError error={resource.error} onRetry={resource.retry} />;
  }

  const blueprint = resource.data.blueprints.find((item) => item.key === blueprintKey);

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <p className="text-sm text-muted-foreground">{t("install.blueprint.body")}</p>
      {applied !== null && (
        <p className="text-sm text-muted-foreground">
          {t("install.blueprint.applied", { key: applied })}
        </p>
      )}
      <fieldset className="grid gap-2" disabled={isSubmitting}>
        <legend className="text-sm font-medium text-foreground">
          {t("install.blueprint.chooseTemplate")}
        </legend>
        {resource.data.blueprints.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="install-blueprint"
              value={item.key}
              checked={item.key === blueprintKey}
              onChange={() => selectBlueprint(item)}
            />
            <span className="font-medium text-foreground">{item.names[locale]}</span>
          </label>
        ))}
      </fieldset>
      {blueprint === undefined ? null : (
        <InstallBlueprintTree
          blueprint={blueprint}
          locale={locale}
          selectedServiceKeys={selectedServiceKeys}
          isDisabled={isSubmitting}
          onToggleService={(serviceKey, isSelected) =>
            setSelectedServiceKeys((current) =>
              isSelected ? [...current, serviceKey] : current.filter((key) => key !== serviceKey),
            )
          }
        />
      )}
      <label className="flex items-start justify-between gap-3 text-sm">
        <span>
          <span className="font-medium text-foreground">{t("install.blueprint.tierGroups")}</span>
          <span className="mt-1 block text-muted-foreground">
            {t("install.blueprint.tierGroupsHint")}
          </span>
        </span>
        <Switch
          checked={createTierGroups}
          disabled={isSubmitting}
          onCheckedChange={setCreateTierGroups}
        />
      </label>
      {errorKey !== null && (
        <p className={errorTextClassName} role="alert">
          {t(errorKey)}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || blueprintKey === null}>
          {isSubmitting ? t("install.saving") : t("install.blueprint.submit")}
        </Button>
      </div>
    </form>
  );
}
