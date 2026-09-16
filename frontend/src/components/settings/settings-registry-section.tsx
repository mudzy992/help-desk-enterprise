import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsRegistryField } from "@/components/settings/settings-registry-field";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  const secretCount = group.entries.filter(
    (entry) => entry.visibility === "secret",
  ).length;

  return (
    <Card className="transition-colors hover:border-[#31405C]">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-4 pb-3 pt-3.5 text-left"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <div className="flex min-w-0 items-start gap-2">
          {isOpen ? (
            <ChevronDown size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <h3 className="text-[13.5px] font-semibold leading-5 text-foreground">
              {title}
            </h3>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/70 tnum">
              {group.categoryKey}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge tone="neutral" dot={false} className="tnum">
            {t("settings.registry.keyCount", { count: group.entries.length })}
          </Badge>
          {secretCount > 0 ? (
            <Badge tone="danger" dot={false}>
              <Lock size={10} /> {secretCount}
            </Badge>
          ) : null}
        </div>
      </button>
      {isOpen ? (
        <ul className="divide-y divide-border/50 border-t border-border/70">
          {group.entries.map((entry) => (
            <li key={`${entry.key}:${String(entry.value)}:${entry.isSet}`}>
              <SettingsRegistryField
                entry={entry}
                canWrite={canWrite}
                pending={pendingKey === entry.key}
                onSave={onSave}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
