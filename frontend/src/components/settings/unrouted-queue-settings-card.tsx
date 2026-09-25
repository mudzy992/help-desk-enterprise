import { Mail } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { selectCompactClassName } from "@/components/ui/control";
import { listGroups, type GroupListItemResponse } from "@/services/groups-api";
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
  const targetGroupId = readStringSetting(entries, unroutedSettingKeys.targetGroupId, "");
  const cleanupEntry = entries.find((entry) => entry.key === unroutedSettingKeys.cleanupSlaHours);
  const cleanupHours = typeof cleanupEntry?.value === "number" ? cleanupEntry.value : 8;
  const weeklyDigest = readBooleanSetting(entries, unroutedSettingKeys.weeklyDigest, true);
  const [groups, setGroups] = useState<readonly GroupListItemResponse[]>([]);
  const [draftTarget, setDraftTarget] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    listGroups()
      .then((items) => {
        if (active) setGroups(items);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const targetMissing =
    targetGroupId.length > 0 && groups.length > 0 && !groups.some((group) => group.id === targetGroupId);
  const [draftEnabled, setDraftEnabled] = useState<boolean | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerEntries = useMemo(
    () =>
      filterSettingsByKeys(entries, [
        unroutedSettingKeys.enabled,
        unroutedSettingKeys.ownerRole,
        unroutedSettingKeys.cleanupSlaHours,
        unroutedSettingKeys.weeklyDigest,
      ]),
    [entries],
  );
  const effectiveEnabled = draftEnabled ?? enabled;

  return (
    <>
      <Card className="fade-in">
        <CardHeader
          title={t("settings.unrouted.title")}
          subtitle={t("settings.unrouted.subtitle")}
        />
        <div className="space-y-2.5 px-4 py-4 text-[12px]">
          <p className="flex items-center justify-between gap-2">
            <span className="tnum font-mono text-[11px] text-muted-foreground">
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
            <span className="tnum font-mono text-[11px] text-muted-foreground">
              {unroutedSettingKeys.ownerRole}
            </span>
            <Badge tone="danger" dot={false}>
              {ownerRole || "—"}
            </Badge>
          </p>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] text-muted-foreground">{t("settings.unrouted.targetGroup")}</span>
            <select
              className={`${selectCompactClassName} max-w-[220px]`}
              value={draftTarget ?? targetGroupId}
              disabled={!canWrite || pendingKey === unroutedSettingKeys.targetGroupId}
              onChange={(event) => setDraftTarget(event.target.value)}
            >
              <option value="">{t("settings.unrouted.targetGroupNone")}</option>
              {targetMissing ? (
                <option value={targetGroupId}>{t("settings.unrouted.targetGroupMissing")}</option>
              ) : null}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          {targetMissing ? (
            <p role="alert" className="text-[11px] text-danger">{t("settings.unrouted.targetGroupMissingHint")}</p>
          ) : null}
          {draftTarget !== null && draftTarget !== targetGroupId ? (
            <SettingsReasonConfirm
              pending={pendingKey === unroutedSettingKeys.targetGroupId}
              onCancel={() => setDraftTarget(null)}
              onConfirm={async (reason) => {
                await onSave({ key: unroutedSettingKeys.targetGroupId, value: draftTarget, reason });
                setDraftTarget(null);
              }}
            />
          ) : null}
          <p className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] text-muted-foreground">{t("settings.unrouted.cleanup")}</span>
            <Badge tone={cleanupHours === 0 ? "neutral" : "warning"} dot={false}>
              {cleanupHours === 0
                ? t("settings.unrouted.cleanupOff")
                : t("settings.unrouted.cleanupHours", { count: cleanupHours })}
              {cleanupHours > 0 && weeklyDigest ? ` · ${t("settings.unrouted.digestOn")}` : ""}
            </Badge>
          </p>
          <p className="flex items-start gap-1.5 border-t border-border/70 pt-3 text-[11px] leading-[15px] text-muted-foreground/70">
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
