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
import {
  emailChannelSettingKeys,
  type SettingRegistryEntry,
} from "@/services/settings-api";

const providerPresetHosts: Readonly<Record<string, string>> = {
  o365: "smtp.office365.com",
  gmail: "smtp.gmail.com",
};

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
  const provider = readStringSetting(entries, "private.smtp.provider", "o365");
  const typedHost = readStringSetting(entries, smtpSettingKeys.host, "");
  // Paket 1.5 (E10): an empty host means the provider preset is used.
  const host =
    typedHost.length > 0
      ? typedHost
      : (providerPresetHosts[provider] ?? "—");
  const username = readStringSetting(entries, smtpSettingKeys.username, "—");
  const passwordSet =
    entries.find((entry) => entry.key === smtpSettingKeys.password)?.isSet === true;
  const internalOnly = readBooleanSetting(
    entries,
    emailChannelSettingKeys.internalOnly,
    true,
  );
  // Restricted delivery with nothing on any list reaches nobody: say so.
  const restrictedToNobody =
    internalOnly &&
    [
      emailChannelSettingKeys.internalDomainsCsv,
      emailChannelSettingKeys.allowedExternalDomainsCsv,
      emailChannelSettingKeys.allowedExternalEmailsCsv,
    ].every((key) => readStringSetting(entries, key, "").trim().length === 0);
  const drawerEntries = useMemo(() => {
    const smtp = filterSettingsByPrefix(entries, "private.smtp.");
    // The template registry JSON is edited in the "E-mail templates" card.
    const channel = filterSettingsByKeys(
      entries,
      Object.values(emailChannelSettingKeys).filter(
        (key) => key !== emailChannelSettingKeys.templatesJson,
      ),
    );
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
        {/*
          No `opacity-40` here: it dropped every value in this block below 4.5:1
          (measured 2.3:1 for `text-foreground/90`, 1.8:1 for the muted labels),
          and axe reported all of it as `serious color-contrast` in the 2026-10-05
          run. Disabling is now carried by the note below and by the disabled
          button, so the information stays readable while the channel is off.
        */}
        <div className="space-y-2.5 px-4 pt-4 text-[12px]">
          {!effectiveEnabled ? (
            <p className="text-muted-foreground" data-testid="smtp-disabled-note">
              {t("settings.smtp.disabledNote")}
            </p>
          ) : null}
          <p className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("settings.smtp.provider")}</span>
            <span className="text-foreground/90" data-testid="smtp-provider">
              {t(`settings.emailTemplates.providers.${provider}`, { defaultValue: provider })}
            </span>
          </p>
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
              <EyeOff size={12} className="text-muted-foreground" />
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
          {restrictedToNobody ? (
            <p className="text-[11px] text-warning" data-testid="email-no-recipients-warning">
              {t("settings.email.noRecipientsWarning")}
            </p>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="mt-1"
            disabled={!effectiveEnabled}
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
