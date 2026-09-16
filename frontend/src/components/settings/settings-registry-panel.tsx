import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { SettingsRegistrySection } from "@/components/settings/settings-registry-section";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { hintClassName, sectionTitleClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError, type ApiErrorKey } from "@/lib/map-api-error";
import { groupSettingsByCategory } from "@/lib/settings/group-settings-by-category";
import { isFeaturedSettingKey } from "@/lib/settings/is-featured-setting-key";
import {
  getSettingsGeneration,
  subscribeSettingsGeneration,
} from "@/lib/settings/settings-realtime-store";
import {
  getSettingsRegistry,
  updateSetting,
  type SettingRegistryEntry,
} from "@/services/settings-api";

interface SettingsRegistryPanelProperties {
  readonly canWrite: boolean;
}

export function SettingsRegistryPanel({ canWrite }: SettingsRegistryPanelProperties) {
  const { t } = useTranslation();
  const settingsGeneration = useSyncExternalStore(
    subscribeSettingsGeneration,
    getSettingsGeneration,
    getSettingsGeneration,
  );
  const [entries, setEntries] = useState<readonly SettingRegistryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<ApiErrorKey | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      setEntries(await getSettingsRegistry());
    } catch (error) {
      setErrorKey(mapApiError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, settingsGeneration]);

  const genericEntries = useMemo(
    () => entries.filter((entry) => !isFeaturedSettingKey(entry.key)),
    [entries],
  );
  const groups = useMemo(
    () => groupSettingsByCategory(genericEntries),
    [genericEntries],
  );

  const handleSave = async (input: {
    readonly key: string;
    readonly value: string | number | boolean;
    readonly reason: string;
  }) => {
    setPendingKey(input.key);
    setErrorKey(null);
    try {
      await updateSetting(input);
      await reload();
    } catch (error) {
      setErrorKey(mapApiError(error));
    } finally {
      setPendingKey(null);
    }
  };

  if (isLoading && entries.length === 0) {
    return <PanelSkeleton className="mt-0" label={t("settings.registry.loading")} />;
  }
  if (errorKey !== null && entries.length === 0) {
    return <ApiErrorText messageKey={errorKey} />;
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={sectionTitleClassName}>{t("settings.registry.title")}</h2>
          <p className={hintClassName}>{t("settings.registry.subtitle")}</p>
          {!canWrite ? (
            <p className={hintClassName}>{t("settings.registry.readOnly")}</p>
          ) : null}
        </div>
        <Badge tone="primary" dot={false} className="tnum">
          {t("settings.registry.keyCount", { count: genericEntries.length })}
        </Badge>
      </div>
      {errorKey !== null ? <ApiErrorText messageKey={errorKey} /> : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <SettingsRegistrySection
            key={group.categoryKey}
            group={group}
            canWrite={canWrite}
            pendingKey={pendingKey}
            onSave={handleSave}
          />
        ))}
      </div>
    </section>
  );
}
