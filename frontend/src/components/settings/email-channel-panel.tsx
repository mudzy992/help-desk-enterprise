import { useTranslation } from "react-i18next";
import { EmailChannelSwitchRow } from "@/components/settings/email-channel-switch-row";
import { EmailTemplateFields } from "@/components/settings/email-template-fields";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { controlClassName, hintClassName, labelClassName } from "@/components/ui/control";
import { emailTemplatePlaceholders } from "@/lib/settings/email-template-keys";
import { isEmailTemplateRegistryValid } from "@/lib/settings/parse-email-template-registry";
import { useEmailChannelForm } from "@/lib/settings/use-email-channel-form";

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
      />
      <form className="grid max-w-2xl gap-4 px-4 py-4" onSubmit={form.save}>
        <p className={hintClassName}>
          {smtpBlocked
            ? t("settings.email.smtpRequired")
            : t("settings.email.deliveryHint")}
        </p>
        <EmailChannelSwitchRow
          checked={form.channelEnabled}
          disabled={!canWrite || smtpBlocked}
          label={t("settings.email.channelEnabled")}
          description={t("settings.email.channelEnabledHint")}
          onCheckedChange={form.setChannelEnabled}
        />
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
          <div>
            <Button
              type="submit"
              disabled={
                form.isSaving || !templatesValid || form.reason.trim().length === 0
              }
            >
              {form.isSaving ? t("settings.email.saving") : t("settings.email.save")}
            </Button>
          </div>
        ) : (
          <p className={hintClassName}>{t("settings.email.readOnly")}</p>
        )}
      </form>
    </Card>
  );
}
