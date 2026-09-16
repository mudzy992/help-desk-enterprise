import { useTranslation } from "react-i18next";
import { EmailChannelSwitchRow } from "@/components/settings/email-channel-switch-row";
import { EmailTemplateFields } from "@/components/settings/email-template-fields";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { controlClassName, hintClassName, labelClassName } from "@/components/ui/control";
import { Switch } from "@/components/ui/switch";
import { emailTemplatePlaceholders } from "@/lib/settings/email-template-keys";
import { isEmailTemplateRegistryValid } from "@/lib/settings/parse-email-template-registry";
import { useEmailChannelForm } from "@/lib/settings/use-email-channel-form";
import { cn } from "@/lib/utils";

interface EmailChannelPanelProperties {
  readonly canWrite: boolean;
}

export function EmailChannelPanel({ canWrite }: EmailChannelPanelProperties) {
  const { t } = useTranslation();
  const form = useEmailChannelForm();

  if (form.snapshot === null && form.errorKey !== null) {
    return <ApiErrorText messageKey={form.errorKey} />;
  }
  if (form.snapshot === null || form.templates === null) {
    return <p className={hintClassName}>{t("settings.email.loading")}</p>;
  }

  const smtpBlocked =
    !form.snapshot.smtpEnabled || !form.snapshot.emailAddonEnabled;
  const templatesValid = isEmailTemplateRegistryValid(form.templates);

  return (
    <Card>
      <CardHeader
        title={t("settings.email.title")}
        subtitle={t("settings.email.subtitle")}
        actions={
          <Switch
            checked={form.channelEnabled}
            disabled={!canWrite || smtpBlocked}
            onCheckedChange={form.setChannelEnabled}
            aria-label={t("settings.email.channelEnabled")}
          />
        }
      />
      <form
        className={cn("space-y-3 px-4 py-4", smtpBlocked && "opacity-40")}
        onSubmit={form.save}
      >
        <p className={hintClassName}>
          {smtpBlocked
            ? t("settings.email.smtpRequired")
            : t("settings.email.deliveryHint")}
        </p>
        <EmailChannelSwitchRow
          checked={form.templatesEnabled}
          disabled={!canWrite}
          label={t("settings.email.templatesEnabled")}
          description={t("settings.email.templatesEnabledHint")}
          onCheckedChange={form.setTemplatesEnabled}
        />
        <EmailChannelSwitchRow
          checked={form.internalOnly}
          disabled={!canWrite}
          label={t("settings.email.internalOnly")}
          description={t("settings.email.internalOnlyHint")}
          onCheckedChange={form.setInternalOnly}
        />
        {form.internalOnly ? (
          <p className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">{t("settings.email.scopeLabel")}</span>
            <Badge tone="info" dot={false}>
              {t("settings.email.internalOnlyBadge")}
            </Badge>
          </p>
        ) : null}
        <label className={labelClassName}>
          {t("settings.email.allowedDomains")}
          <input
            className={controlClassName}
            value={form.allowedDomains}
            disabled={!canWrite || form.internalOnly}
            onChange={(event) => form.setAllowedDomains(event.target.value)}
          />
        </label>
        <label className={labelClassName}>
          {t("settings.email.allowedEmails")}
          <input
            className={controlClassName}
            value={form.allowedEmails}
            disabled={!canWrite || form.internalOnly}
            onChange={(event) => form.setAllowedEmails(event.target.value)}
          />
        </label>
        <p className={hintClassName}>
          {t("settings.email.placeholdersHint", {
            placeholders: emailTemplatePlaceholders
              .map((item) => `{{${item}}}`)
              .join(", "),
          })}
        </p>
        <EmailTemplateFields
          templates={form.templates}
          disabled={!canWrite || !form.templatesEnabled}
          onChange={form.setTemplates}
        />
        <div className="space-y-2 border-t border-border/60 pt-3">
          <label className={labelClassName}>
            {t("settings.email.reason")}
            <input
              className={controlClassName}
              value={form.reason}
              disabled={!canWrite}
              onChange={(event) => form.setReason(event.target.value)}
              required
            />
          </label>
          {form.errorKey ? <ApiErrorText messageKey={form.errorKey} /> : null}
          {canWrite ? (
            <Button
              type="submit"
              size="sm"
              disabled={
                form.isSaving || !templatesValid || form.reason.trim().length === 0
              }
            >
              {form.isSaving ? t("settings.email.saving") : t("settings.email.save")}
            </Button>
          ) : (
            <p className={hintClassName}>{t("settings.email.readOnly")}</p>
          )}
        </div>
      </form>
    </Card>
  );
}
