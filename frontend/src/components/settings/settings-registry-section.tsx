import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCategoryDrawer } from "@/components/settings/settings-category-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import type { SettingsCategoryGroup } from "@/lib/settings/group-settings-by-category";
import { resolveCategoryIcon } from "@/lib/settings/resolve-category-icon";
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const title = resolveRegistryCategoryTitle(t, group.categoryKey);
  const CategoryIcon = resolveCategoryIcon(group.categoryIcon);
  const preview = group.entries.slice(0, 3);

  return (
    <>
      <Card className="transition-colors hover:border-line-strong">
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
        <div className="space-y-2 px-4 pb-4 pt-1">
          {preview.map((entry) => (
            <p
              key={entry.key}
              className="flex items-center justify-between gap-2 text-[12px]"
            >
              <span className="tnum truncate font-mono text-[11px] text-muted-foreground">
                {entry.key}
              </span>
              <span className="shrink-0 text-foreground/90">
                {formatPreviewValue(entry.value ?? entry.defaultValue)}
              </span>
            </p>
          ))}
          {group.entries.length > preview.length ? (
            <p className={hintClassName}>
              {t("settings.registry.moreKeys", {
                count: group.entries.length - preview.length,
              })}
            </p>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="mt-1"
            onClick={() => setDrawerOpen(true)}
          >
            {t("settings.drawer.edit")}
          </Button>
        </div>
      </Card>
      <SettingsCategoryDrawer
        open={drawerOpen}
        title={title}
        description={t("settings.drawer.categoryDescription", {
          category: title,
        })}
        entries={group.entries}
        canWrite={canWrite}
        pendingKey={pendingKey}
        onOpenChange={setDrawerOpen}
        onSave={onSave}
      />
    </>
  );
}

function formatPreviewValue(value: string | number | boolean | null): string {
  if (value === null) {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "on" : "off";
  }
  const text = String(value);
  return text.length > 24 ? `${text.slice(0, 21)}…` : text;
}
