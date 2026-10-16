import { type FormEvent, useCallback, useState } from "react";
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

/** Every request type a template brings — the default selection for that template. */
function serviceKeysOf(blueprint: InstallBlueprint | undefined): readonly string[] {
  if (blueprint === undefined) {
    return [];
  }
  return blueprint.categories.flatMap((category) => category.services.map((s) => s.key));
}

export function InstallBlueprintStep({ onSaved }: { readonly onSaved?: () => void }) {
  const { t, i18n } = useTranslation();
  const locale: InstallBlueprintLocale = resolveInstallLocale(i18n.language);
  // One object for „what the operator picked“: a template and its request types
  // always move together, and `null` means „nothing picked yet — use the default“.
  const [choice, setChoice] = useState<{
    readonly key: string;
    readonly serviceKeys: readonly string[];
  } | null>(null);
  const [createTierGroups, setCreateTierGroups] = useState(false);
  const [errorKey, setErrorKey] = useState<InstallContentErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);

  const resource = useInstallStepResource(
    useCallback(() => loadInstallBlueprints(locale), [locale]),
  );

  /**
   * The first template of the loaded catalog is the default — the one the wizard
   * pre-selects, with every request type it brings. The default is **derived**,
   * not seeded into state by an effect: the form (and its submit button) has to be
   * ready the moment it appears, otherwise a click that beats the effect finds
   * `blueprintKey === null` and the button is disabled while the radios sit
   * unchecked. The operator's own choice wins over the default, and a template
   * applied here wins over what the load reported.
   */
  const blueprints = resource.status === "ready" ? resource.data.blueprints : [];
  const defaultBlueprint = blueprints[0];
  const blueprintKey = choice?.key ?? defaultBlueprint?.key ?? null;
  const selectedServiceKeys = choice?.serviceKeys ?? serviceKeysOf(defaultBlueprint);
  const appliedBlueprint = applied ?? (resource.status === "ready" ? resource.data.applied : null);

  const selectBlueprint = (blueprint: InstallBlueprint) => {
    setChoice({ key: blueprint.key, serviceKeys: serviceKeysOf(blueprint) });
    setErrorKey(null);
  };

  const toggleService = (serviceKey: string, isSelected: boolean) => {
    if (blueprintKey === null) {
      return;
    }
    setChoice({
      key: blueprintKey,
      serviceKeys: isSelected
        ? [...selectedServiceKeys, serviceKey]
        : selectedServiceKeys.filter((key) => key !== serviceKey),
    });
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

  const blueprint = blueprints.find((item) => item.key === blueprintKey);

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <p className="text-sm text-muted-foreground">{t("install.blueprint.body")}</p>
      {appliedBlueprint !== null && (
        <p className="text-sm text-muted-foreground">
          {t("install.blueprint.applied", { key: appliedBlueprint })}
        </p>
      )}
      <fieldset className="grid gap-2" disabled={isSubmitting}>
        <legend className="text-sm font-medium text-foreground">
          {t("install.blueprint.chooseTemplate")}
        </legend>
        {blueprints.map((item) => (
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
          onToggleService={toggleService}
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
