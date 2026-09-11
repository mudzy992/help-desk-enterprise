import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { buildInstallAddonsInput } from "@/lib/build-install-addons-input";
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
}: {
  readonly onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<InstallAddonItem[]>([]);
  const [errorKey, setErrorKey] = useState<InstallAddonsErrorKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    void loadInstallAddons()
      .then((status) => {
        if (!isCancelled) {
          setItems([...status.addons.items]);
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

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const saved = await saveInstallAddons(buildInstallAddonsInput(items));
      setItems([...saved.items]);
      onSaved?.();
    } catch (error) {
      setErrorKey(mapInstallAddonsSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <PanelSkeleton className="mt-6" label={t("install.loading")} />;
  }

  return (
    <form className="mt-6 grid max-w-xl gap-3" onSubmit={(event) => void onSubmit(event)}>
      {items.map((item) => (
        <AddonSwitch
          key={item.key}
          item={item}
          disabled={isSubmitting}
          onEnabledChange={(enabled) =>
            setItems((current) =>
              current.map((entry) =>
                entry.key === item.key && entry.canEnable
                  ? { ...entry, enabled }
                  : entry,
              ),
            )
          }
        />
      ))}
      {errorKey ? (
        <p className={errorTextClassName}>{t(errorKey)}</p>
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
