import { Puzzle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstallFeatureCard } from "@/components/install/install-feature-card";
import { InstallStepLoadError } from "@/components/install/install-step-load-error";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { buildInstallAddonsInput } from "@/lib/build-install-addons-input";
import {
  installAddonCategoryKey,
  installAddonCategoryOrder,
  resolveInstallAddonPresentation,
  type InstallAddonCategoryKey,
} from "@/lib/install/install-addon-presentation";
import { useInstallStepResource } from "@/lib/install/use-install-step-resource";
import {
  mapInstallAddonsSaveError,
  type InstallAddonsErrorKey,
} from "@/lib/map-install-addons-save-error";
import {
  loadInstallAddons,
  saveInstallAddons,
  type InstallAddonItem,
} from "@/services/install-addons-api";

/*
  Install wizard v2 (F4.5): the same fourteen switches, said in the operator's
  language — „CSAT anketa“ with one sentence about what it brings, grouped by what
  it is good for, instead of the catalog's technical flags. The technical wording
  stays in Settings; here the question is „what do you want your help desk to do“.
  A key the presentation does not know yet is shown as it is rather than dropped.
*/
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
  const toggle = (key: string, enabled: boolean) =>
    setDraft(
      items.map((item) => (item.key === key && item.canEnable ? { ...item, enabled } : item)),
    );
  const unclassified = items.filter((item) => resolveInstallAddonPresentation(item.key) === null);

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <p className="text-sm text-muted-foreground">{t("install.addons.body")}</p>
      {installAddonCategoryOrder.map((category) => (
        <AddonSection
          key={category}
          category={category}
          items={items}
          isDisabled={isSubmitting}
          onToggle={toggle}
        />
      ))}
      {unclassified.length === 0 ? null : (
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold text-foreground">{t("install.addons.other")}</h3>
          <div className="grid gap-2">
            {unclassified.map((item) => (
              <InstallFeatureCard
                key={item.key}
                icon={Puzzle}
                title={item.key}
                control="switch"
                checked={item.enabled}
                isDisabled={isSubmitting}
                onCheckedChange={(enabled) => toggle(item.key, enabled)}
              />
            ))}
          </div>
        </section>
      )}
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

function AddonSection({
  category,
  items,
  isDisabled,
  onToggle,
}: {
  readonly category: InstallAddonCategoryKey;
  readonly items: readonly InstallAddonItem[];
  readonly isDisabled: boolean;
  readonly onToggle: (key: string, enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const inCategory = items.filter(
    (item) => resolveInstallAddonPresentation(item.key)?.category === category,
  );
  if (inCategory.length === 0) {
    return null;
  }
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold text-foreground">
        {t(installAddonCategoryKey(category))}
      </h3>
      <div className="grid gap-2">
        {inCategory.map((item) => {
          const copy = resolveInstallAddonPresentation(item.key);
          if (copy === null) {
            return null;
          }
          return (
            <InstallFeatureCard
              key={item.key}
              icon={copy.icon}
              title={t(copy.titleKey)}
              description={t(copy.valueKey)}
              control="switch"
              checked={item.enabled}
              disabledReason={item.canEnable ? undefined : t("install.addons.emailDisabledHint")}
              isDisabled={isDisabled}
              onCheckedChange={(enabled) => onToggle(item.key, enabled)}
            />
          );
        })}
      </div>
    </section>
  );
}
