import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsRegistryCard } from "@/components/settings/settings-registry-card";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { controlCompactClassName, hintClassName, sectionTitleClassName } from "@/components/ui/control";
import { groupSettingsByCategory } from "@/lib/settings/group-settings-by-category";
import { isFeaturedSettingKey } from "@/lib/settings/is-featured-setting-key";
import { resolveRegistryTitle } from "@/lib/settings/resolve-registry-i18n";
import type { SettingsSaver } from "@/lib/settings/use-settings-registry";
import type { ApiErrorKey } from "@/lib/map-api-error";
import type { SettingRegistryEntry } from "@/services/settings-api";

interface SettingsRegistryPanelProperties {
  readonly entries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly errorKey: ApiErrorKey | null;
  readonly onSave: SettingsSaver;
}

/**
 * Paket 5.3.4 (D4): 451 settings are unusable as a flat list, so the panel is a
 * searchable set of category cards. Search matches the human title, the raw key
 * and the backend description, and it never hides a key that exists — an empty
 * result says so instead (with the query still visible).
 */
export function SettingsRegistryPanel({
  entries,
  canWrite,
  pendingKey,
  errorKey,
  onSave,
}: SettingsRegistryPanelProperties) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const genericEntries = useMemo(
    () => entries.filter((entry) => !isFeaturedSettingKey(entry.key)),
    [entries],
  );
  const needle = query.trim().toLocaleLowerCase();
  const matched = useMemo(() => {
    if (needle.length === 0) {
      return genericEntries;
    }
    return genericEntries.filter(
      (entry) =>
        entry.key.toLocaleLowerCase().includes(needle) ||
        resolveRegistryTitle(t, entry).toLocaleLowerCase().includes(needle) ||
        entry.description.toLocaleLowerCase().includes(needle),
    );
  }, [genericEntries, needle, t]);
  const groups = useMemo(() => groupSettingsByCategory(matched), [matched]);
  const isFiltered = needle.length > 0;

  if (genericEntries.length === 0) {
    return null;
  }

  return (
    <section className="fade-in space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={sectionTitleClassName}>{t("settings.registry.title")}</h2>
          <p className={hintClassName}>{t("settings.registry.subtitle")}</p>
          {!canWrite ? (
            <p className={hintClassName}>{t("settings.registry.readOnly")}</p>
          ) : null}
        </div>
        <Badge tone="primary" dot={false} className="tnum">
          {isFiltered
            ? t("settings.panel.matchCount", { count: matched.length })
            : t("settings.registry.keyCount", { count: genericEntries.length })}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Search size={14} aria-hidden className="shrink-0 text-muted-foreground" />
        <input
          className={controlCompactClassName}
          value={query}
          data-testid="settings-registry-search"
          placeholder={t("settings.panel.searchPlaceholder")}
          aria-label={t("settings.panel.searchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
        {isFiltered ? (
          <button
            type="button"
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary/70"
            aria-label={t("settings.panel.clearSearch")}
            onClick={() => setQuery("")}
          >
            <X size={14} aria-hidden />
          </button>
        ) : null}
      </div>
      {errorKey !== null ? <ApiErrorText messageKey={errorKey} /> : null}
      {matched.length === 0 ? (
        <p className={hintClassName} data-testid="settings-registry-empty">
          {t("settings.panel.noMatches")}
        </p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {groups.map((group) => (
            <SettingsRegistryCard
              key={group.categoryKey}
              group={group}
              allEntries={entries}
              canWrite={canWrite}
              pendingKey={pendingKey}
              onSave={onSave}
              isFiltered={isFiltered}
            />
          ))}
        </div>
      )}
    </section>
  );
}
