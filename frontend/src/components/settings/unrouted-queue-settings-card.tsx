import { Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCategoryDrawer } from "@/components/settings/settings-category-drawer";
import { SettingsReasonConfirm } from "@/components/settings/settings-reason-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { unroutedSettingKeys } from "@/lib/settings/is-featured-setting-key";
import {
  filterSettingsByKeys,
  readBooleanSetting,
  readStringSetting,
} from "@/lib/settings/read-setting-entry";
import type { SettingsSaveInput } from "@/lib/settings/use-settings-registry";
import type { SettingRegistryEntry } from "@/services/settings-api";

interface UnroutedQueueSettingsCardProperties {
  readonly entries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onSave: (input: SettingsSaveInput) => Promise<void>;
}

export function UnroutedQueueSettingsCard({
  entries,
  canWrite,
  pendingKey,
  onSave,
}: UnroutedQueueSettingsCardProperties) {
  const { t } = useTranslation();
  const enabled = readBooleanSetting(entries, unroutedSettingKeys.enabled, true);
  const ownerRole = readStringSetting(
    entries,
    unroutedSettingKeys.ownerRole,
    "SUPER_ADMIN",
  );
  const [draftEnabled, setDraftEnabled] = useState<boolean | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerEntries = useMemo(
    () =>
      filterSettingsByKeys(entries, [
        unroutedSettingKeys.enabled,
        unroutedSettingKeys.ownerRole,
      ]),
    [entries],
  );
  const effectiveEnabled = draftEnabled ?? enabled;

  return (
    <>
      <Card>
        <CardHeader
          title={t("settings.unrouted.title")}
          subtitle={t("settings.unrouted.subtitle")}
        />
        <div className="space-y-2.5 px-4 py-4 text-[12px]">
          <p className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-muted-foreground tnum">
              {unroutedSettingKeys.enabled}
            </span>
            <Switch
              checked={effectiveEnabled}
              disabled={!canWrite || pendingKey === unroutedSettingKeys.enabled}
              onCheckedChange={(checked) => setDraftEnabled(checked)}
              aria-label={t("settings.unrouted.enabled")}
            />
          </p>
          <p className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-muted-foreground tnum">
              {unroutedSettingKeys.ownerRole}
            </span>
            <Badge tone="danger" dot={false}>
              {ownerRole || "—"}
            </Badge>
          </p>
          <p className="flex items-start gap-1.5 border-t border-border/60 pt-3 text-[11px] leading-4 text-muted-foreground/70">
            <Mail size={11.5} className="mt-0.5 shrink-0" />
            {t("settings.unrouted.hint")}
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setDrawerOpen(true)}
          >
            {t("settings.drawer.edit")}
          </Button>
          {draftEnabled !== null && draftEnabled !== enabled ? (
            <SettingsReasonConfirm
              pending={pendingKey === unroutedSettingKeys.enabled}
              onCancel={() => setDraftEnabled(null)}
              onConfirm={async (reason) => {
                await onSave({
                  key: unroutedSettingKeys.enabled,
                  value: draftEnabled,
                  reason,
                });
                setDraftEnabled(null);
              }}
            />
          ) : null}
        </div>
      </Card>
      <SettingsCategoryDrawer
        open={drawerOpen}
        title={t("settings.unrouted.drawerTitle")}
        description={t("settings.unrouted.subtitle")}
        entries={drawerEntries}
        canWrite={canWrite}
        pendingKey={pendingKey}
        onOpenChange={setDrawerOpen}
        onSave={onSave}
      />
    </>
  );
}
