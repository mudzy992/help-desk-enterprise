import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsRegistryField } from "@/components/settings/settings-registry-field";
import { Card, CardHeader } from "@/components/ui/card";
import type { SettingsCategoryGroup } from "@/lib/settings/group-settings-by-category";
import { resolveRegistryCategoryTitle } from "@/lib/settings/resolve-registry-i18n";

interface SettingsRegistrySectionProperties {
  readonly group: SettingsCategoryGroup;
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onSave: (input: {
    readonly key: string;
    readonly value: string | number | boolean;
    readonly reason: string;
  }) => Promise<void>;
}

export function SettingsRegistrySection({
  group,
  canWrite,
  pendingKey,
  onSave,
}: SettingsRegistrySectionProperties) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const title = resolveRegistryCategoryTitle(t, group.categoryKey);

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={t("settings.registry.keyCount", {
          count: group.entries.length,
        })}
        actions={
          <button
            type="button"
            className="text-[12px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setIsOpen((current) => !current)}
            aria-expanded={isOpen}
          >
            {isOpen
              ? t("settings.registry.collapse")
              : t("settings.registry.expand")}
          </button>
        }
      />
      {isOpen ? (
        <div>
          {group.entries.map((entry) => (
            <SettingsRegistryField
              key={`${entry.key}:${String(entry.value)}:${entry.isSet}`}
              entry={entry}
              canWrite={canWrite}
              pending={pendingKey === entry.key}
              onSave={onSave}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
