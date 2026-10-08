import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingDetailDialog } from "@/components/settings/setting-detail-dialog";
import { SettingsCategoryDialog } from "@/components/settings/settings-category-dialog";
import { SettingsRegistryRow } from "@/components/settings/settings-registry-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import type { SettingsCategoryGroup } from "@/lib/settings/group-settings-by-category";
import { resolveCategoryIcon } from "@/lib/settings/resolve-category-icon";
import { resolveRegistryCategoryTitle } from "@/lib/settings/resolve-registry-i18n";
import type { SettingsSaver } from "@/lib/settings/use-settings-registry";
import type { SettingRegistryEntry } from "@/services/settings-api";

interface SettingsRegistryCardProperties {
  readonly group: SettingsCategoryGroup;
  /** Full registry, for dependency evaluation of keys outside this category. */
  readonly allEntries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onSave: SettingsSaver;
  /** Set while a global search is active: then the card shows every match. */
  readonly isFiltered: boolean;
}

/** How many rows a card shows when nothing is filtered. */
const previewRows = 4;

/**
 * Paket 5.3.4 (D4/D5): a category card is a summary — the icon, the human
 * category title, the number of keys and the first few settings with their
 * values. "Prikaži sve" opens the whole category; every row opens one detail
 * dialog. The old drawer listed raw keys with a description in a small print,
 * which is what made the tab unreadable.
 */
export function SettingsRegistryCard({
  group,
  allEntries,
  canWrite,
  pendingKey,
  onSave,
  isFiltered,
}: SettingsRegistryCardProperties) {
  const { t } = useTranslation();
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const title = resolveRegistryCategoryTitle(t, group.categoryKey);
  const CategoryIcon = resolveCategoryIcon(group.categoryIcon);
  const visible = isFiltered ? group.entries : group.entries.slice(0, previewRows);
  const hiddenCount = group.entries.length - visible.length;
  const openEntry = group.entries.find((entry) => entry.key === openKey) ?? null;

  return (
    <>
      <Card className="flex h-full flex-col transition-colors hover:border-line-strong">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <CategoryIcon
                aria-hidden
                className="size-4 shrink-0 text-line-strong"
              />
              <span>{title}</span>
            </span>
          }
          actions={
            <Badge tone="neutral" dot={false} className="tnum">
              {t("settings.registry.keyCount", { count: group.entries.length })}
            </Badge>
          }
        />
        <ul className="flex-1 divide-y divide-border/50 border-t border-border/60">
          {visible.map((entry) => (
            <li key={entry.key}>
              <SettingsRegistryRow
                entry={entry}
                onOpen={() => setOpenKey(entry.key)}
              />
            </li>
          ))}
          {visible.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-muted-foreground">
              {t("settings.panel.noMatches")}
            </li>
          ) : null}
        </ul>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          {hiddenCount > 0 ? (
            <p className={hintClassName}>
              {t("settings.registry.moreKeys", { count: hiddenCount })}
            </p>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="xs"
            variant="outline"
            data-testid={`settings-open-${group.categoryKey}`}
            onClick={() => setIsCategoryOpen(true)}
          >
            {t("settings.drawer.edit")}
          </Button>
        </div>
      </Card>

      <SettingsCategoryDialog
        open={isCategoryOpen}
        onOpenChange={setIsCategoryOpen}
        title={title}
        entries={group.entries}
        allEntries={allEntries}
        canWrite={canWrite}
        pendingKey={pendingKey}
        onSave={onSave}
      />

      {openEntry === null ? null : (
        <SettingDetailDialog
          key={openEntry.key}
          open
          onOpenChange={(next) => {
            if (!next) {
              setOpenKey(null);
            }
          }}
          entry={openEntry}
          entries={allEntries}
          canWrite={canWrite}
          pending={pendingKey === openEntry.key}
          onSave={onSave}
        />
      )}
    </>
  );
}
