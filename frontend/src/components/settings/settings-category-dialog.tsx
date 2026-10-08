import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingDetailDialog } from "@/components/settings/setting-detail-dialog";
import { SettingsRegistryRow } from "@/components/settings/settings-registry-row";
import { Button } from "@/components/ui/button";
import { controlCompactClassName } from "@/components/ui/control";
import { ResponsiveSurface } from "@/components/ui/responsive-surface";
import { groupCategoryEntries } from "@/lib/settings/group-category-entries";
import { resolveRegistryGroupTitle, resolveRegistryTitle } from "@/lib/settings/resolve-registry-i18n";
import type { SettingsSaver } from "@/lib/settings/use-settings-registry";
import type { SettingRegistryEntry } from "@/services/settings-api";

interface SettingsCategoryDialogProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  /** The keys listed inside this surface (one category, or one feature prefix). */
  readonly entries: readonly SettingRegistryEntry[];
  /**
   * The whole registry. A dependency may point at a key in another category
   * (`private.notifications.edge.enabled` needs `private.edgeExtension.enabled`),
   * so the gate has to be evaluated against everything the server sent.
   */
  readonly allEntries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onSave: SettingsSaver;
}

/** Above this many keys a category gets its own search box inside the dialog. */
const searchFromEntries = 12;

/**
 * Paket 5.3.4 (D5): everything in one category, grouped by the `group` the
 * definition declares ("Veza", "Autentikacija", …). A row opens the detail
 * dialog; nothing is edited inline, so a mis-tap on a phone cannot save.
 */
export function SettingsCategoryDialog({
  open,
  onOpenChange,
  title,
  description,
  entries,
  allEntries,
  canWrite,
  pendingKey,
  onSave,
}: SettingsCategoryDialogProperties) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (needle.length === 0) {
      return entries;
    }
    return entries.filter(
      (entry) =>
        entry.key.toLocaleLowerCase().includes(needle) ||
        resolveRegistryTitle(t, entry).toLocaleLowerCase().includes(needle) ||
        entry.description.toLocaleLowerCase().includes(needle),
    );
  }, [entries, query, t]);
  const groups = useMemo(() => groupCategoryEntries(filtered), [filtered]);
  const openEntry = entries.find((entry) => entry.key === openKey) ?? null;

  return (
    <>
      <ResponsiveSurface
        open={open}
        onOpenChange={onOpenChange}
        testId="settings-category-dialog"
        title={title}
        description={
          description ?? t("settings.drawer.categoryDescription", { category: title })
        }
      >
        {entries.length >= searchFromEntries ? (
          <label className="mb-3 flex items-center gap-2">
            <Search size={14} aria-hidden className="shrink-0 text-muted-foreground" />
            <input
              className={controlCompactClassName}
              value={query}
              data-testid="settings-category-search"
              placeholder={t("settings.panel.searchPlaceholder")}
              aria-label={t("settings.panel.searchPlaceholder")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}

        {filtered.length === 0 ? (
          <p className="px-1 py-2 text-[12px] text-muted-foreground">
            {t("settings.panel.noMatches")}
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const groupTitle =
                group.groupId === null
                  ? null
                  : resolveRegistryGroupTitle(
                      t,
                      group.entries[0]?.categoryId ?? "",
                      group.groupId,
                    );
              return (
                <section key={group.groupId ?? "ungrouped"}>
                  {groupTitle === null ? null : (
                    <h3 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {groupTitle}
                    </h3>
                  )}
                  <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
                    {group.entries.map((entry) => (
                      <li key={entry.key}>
                        <SettingsRegistryRow
                          entry={entry}
                          onOpen={() => setOpenKey(entry.key)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={() => onOpenChange(false)}
          >
            {t("ui.close")}
          </Button>
        </div>
      </ResponsiveSurface>

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
