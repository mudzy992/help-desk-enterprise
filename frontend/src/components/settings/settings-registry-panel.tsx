import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingsRegistrySection } from "@/components/settings/settings-registry-section";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { hintClassName, sectionTitleClassName } from "@/components/ui/control";
import { groupSettingsByCategory } from "@/lib/settings/group-settings-by-category";
import { isFeaturedSettingKey } from "@/lib/settings/is-featured-setting-key";
import type { SettingsSaveInput } from "@/lib/settings/use-settings-registry";
import type { ApiErrorKey } from "@/lib/map-api-error";
import type { SettingRegistryEntry } from "@/services/settings-api";

interface SettingsRegistryPanelProperties {
  readonly entries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly errorKey: ApiErrorKey | null;
  readonly onSave: (input: SettingsSaveInput) => Promise<void>;
}

export function SettingsRegistryPanel({
  entries,
  canWrite,
  pendingKey,
  errorKey,
  onSave,
}: SettingsRegistryPanelProperties) {
  const { t } = useTranslation();
  const genericEntries = useMemo(
    () => entries.filter((entry) => !isFeaturedSettingKey(entry.key)),
    [entries],
  );
  const groups = useMemo(
    () => groupSettingsByCategory(genericEntries),
    [genericEntries],
  );

  if (genericEntries.length === 0) {
    return null;
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
            onSave={onSave}
          />
        ))}
      </div>
    </section>
  );
}
