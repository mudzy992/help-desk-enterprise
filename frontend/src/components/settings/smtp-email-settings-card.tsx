import { EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCategoryDrawer } from "@/components/settings/settings-category-drawer";
import { SettingsReasonConfirm } from "@/components/settings/settings-reason-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  smtpSettingKeys,
} from "@/lib/settings/is-featured-setting-key";
import {
  filterSettingsByKeys,
  filterSettingsByPrefix,
  readBooleanSetting,
  readStringSetting,
} from "@/lib/settings/read-setting-entry";
import type { SettingsSaveInput } from "@/lib/settings/use-settings-registry";
import { cn } from "@/lib/utils";
import {
  emailChannelSettingKeys,
  type SettingRegistryEntry,
} from "@/services/settings-api";

interface SmtpEmailSettingsCardProperties {
  readonly entries: readonly SettingRegistryEntry[];
  readonly canWrite: boolean;
  readonly pendingKey: string | null;
  readonly onSave: (input: SettingsSaveInput) => Promise<void>;
}

export function SmtpEmailSettingsCard({
  entries,
  canWrite,
  pendingKey,
  onSave,
}: SmtpEmailSettingsCardProperties) {
  const { t } = useTranslation();
  const smtpEnabled = readBooleanSetting(entries, smtpSettingKeys.enabled);
  const [draftEnabled, setDraftEnabled] = useState<boolean | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const effectiveEnabled = draftEnabled ?? smtpEnabled;
  const host = readStringSetting(entries, smtpSettingKeys.host, "—");
  const username = readStringSetting(entries, smtpSettingKeys.username, "—");
  const passwordSet =
    entries.find((entry) => entry.key === smtpSettingKeys.password)?.isSet === true;
  const internalOnly = readBooleanSetting(
    entries,
    emailChannelSettingKeys.internalOnly,
    true,
  );
  const drawerEntries = useMemo(() => {
    const smtp = filterSettingsByPrefix(entries, "private.smtp.");
    const channel = filterSettingsByKeys(entries, Object.values(emailChannelSettingKeys));
    return [...smtp, ...channel];
  }, [entries]);

  return (
    <>
      <Card className="fade-in">
        <CardHeader
          title={t("settings.smtp.title")}
          subtitle={t("settings.smtp.subtitle")}
          actions={
            <Switch
              checked={effectiveEnabled}
              disabled={!canWrite || pendingKey === smtpSettingKeys.enabled}
              onCheckedChange={(checked) => setDraftEnabled(checked)}
              aria-label={t("settings.smtp.enabled")}
            />
          }
        />
        <div
          className={cn(
            "space-y-2.5 px-4 pt-4 text-[12px]",
            !effectiveEnabled && "pointer-events-none opacity-40",
          )}
        >
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("settings.smtp.host")}</span>
            <span className="tnum text-foreground/90">{host}</span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("settings.smtp.username")}</span>
            <span className="tnum text-foreground/90">{username}</span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("settings.smtp.password")}</span>
            <span className="flex items-center gap-1.5 tnum text-foreground/90">
              {passwordSet ? "••••••••••" : "—"}
              <EyeOff size={12} className="text-muted-foreground/60" />
            </span>
          </p>
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("settings.smtp.scope")}</span>
            {internalOnly ? (
              <Badge tone="info" dot={false}>
                {t("settings.email.internalOnlyBadge")}
              </Badge>
            ) : (
              <Badge tone="neutral" dot={false}>
                {t("settings.smtp.externalAllowed")}
              </Badge>
            )}
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="mt-1"
            onClick={() => setDrawerOpen(true)}
          >
            {t("settings.smtp.editDetails")}
          </Button>
        </div>
        <div className="px-4 pb-4">
          {draftEnabled !== null && draftEnabled !== smtpEnabled ? (
            <SettingsReasonConfirm
              pending={pendingKey === smtpSettingKeys.enabled}
              onCancel={() => setDraftEnabled(null)}
              onConfirm={async (reason) => {
                await onSave({
                  key: smtpSettingKeys.enabled,
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
        title={t("settings.smtp.drawerTitle")}
        description={t("settings.smtp.drawerDescription")}
        entries={drawerEntries}
        canWrite={canWrite}
        pendingKey={pendingKey}
        onOpenChange={setDrawerOpen}
        onSave={onSave}
      />
    </>
  );
}
