import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { buildInstallAddonsInput } from "@/lib/build-install-addons-input";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import { resolveInstallAddonCopy } from "@/lib/install-addon-copy";
import {
  mapInstallAddonsSaveError,
  type InstallAddonsErrorKey,
} from "@/lib/map-install-addons-save-error";
import {
  loadInstallAddons,
  saveInstallAddons,
  type InstallAddonItem,
} from "@/services/install-addons-api";

export function InstallAddonsStep({
  onSaved,
  isSaved = false,
}: {
  readonly onSaved?: () => void;
  /**
   * F0.5: `steps.addons.completed` from `/install/status` — true only once the
   * catalog was saved at least once, so a refresh cannot skip the step (and the
   * defaults are never silently accepted).
   */
  readonly isSaved?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<readonly InstallAddonItem[] | null>(null);
  const [errorKey, setErrorKey] = useState<InstallAddonsErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // F0.2/IN3: no form until the stored catalog was read.
  const resource = useInstallStepResource(loadInstallAddons);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const saved = await saveInstallAddons(buildInstallAddonsInput(items));
      resource.setData({ addons: saved });
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallAddonsSaveError(error));
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

  const items = draft ?? resource.data.addons.items;

  return (
    <form className="grid gap-4" onSubmit={(event) => void onSubmit(event)}>
      {items.map((item) => (
        <AddonSwitch
          key={item.key}
          item={item}
          disabled={isSubmitting}
          onEnabledChange={(enabled) =>
            setDraft(
              items.map((entry) =>
                entry.key === item.key && entry.canEnable ? { ...entry, enabled } : entry,
              ),
            )
          }
        />
      ))}
      {isSaved ? null : (
        <p className="text-[12px] leading-5 text-muted-foreground">
          {t("install.addons.notSavedHint")}
        </p>
      )}
      {errorKey ? (
        <p role="alert" className={errorTextClassName}>
          {t(errorKey)}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting || items.length === 0}>
          {isSubmitting ? t("install.addons.saving") : t("install.addons.submit")}
        </Button>
      </div>
    </form>
  );
}

function AddonSwitch(input: {
  readonly item: InstallAddonItem;
  readonly disabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const copy = resolveInstallAddonCopy(input.item.key);
  const label = copy === null ? input.item.key : t(copy.label);
  const description = copy === null ? "" : t(copy.description);
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-3">
      <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <Switch
          checked={input.item.enabled}
          disabled={input.disabled || !input.item.canEnable}
          onCheckedChange={input.onEnabledChange}
          aria-label={label}
        />
        {label}
      </label>
      <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">
        {description}
        {input.item.key === "email" && !input.item.canEnable
          ? ` ${t("install.addons.emailDisabledHint")}`
          : ""}
      </p>
    </div>
  );
}
