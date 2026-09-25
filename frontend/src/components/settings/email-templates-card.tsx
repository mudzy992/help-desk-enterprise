import { AlertTriangle, Mail } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { isTemplateModified } from "@/lib/settings/email-template-draft";
import { getEmailTemplates, type EmailTemplatesOverview } from "@/services/email-templates-api";

interface EmailTemplatesCardProperties {
  readonly canWrite: boolean;
}

// canWrite is enforced on the editor page; the card is a read-only summary.
export function EmailTemplatesCard(_properties: EmailTemplatesCardProperties) {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<EmailTemplatesOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigate = useNavigate();

  const reload = useCallback(async () => {
    try {
      setOverview(await getEmailTemplates());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const modifiedCount = useMemo(() => {
    if (overview === null) return 0;
    return overview.locales.reduce(
      (count, locale) =>
        count +
        overview.keys.filter((key) => {
          const current = overview.templates[locale][key];
          const fallback = overview.defaults[locale][key];
          return current !== undefined && fallback !== undefined && isTemplateModified(current, fallback);
        }).length,
      0,
    );
  }, [overview]);

  const delivery = overview?.delivery;
  return (
    <>
      <Card className="fade-in" data-testid="email-templates-card">
        <CardHeader
          title={t("settings.emailTemplates.title")}
          subtitle={t("settings.emailTemplates.subtitle")}
        />
        <div className="space-y-2.5 px-4 pb-4 pt-4 text-[12px]">
          {loadError !== null ? <p className="text-danger">{loadError}</p> : null}
          {delivery !== undefined ? (
            <>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("settings.emailTemplates.provider")}</span>
                <span className="text-foreground/90">
                  {t(`settings.emailTemplates.providers.${delivery.provider}`)}
                </span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("settings.emailTemplates.replyMode")}</span>
                <Badge tone={delivery.replyMode === "shared_mailbox" ? "info" : "neutral"}>
                  {delivery.replyMode === "shared_mailbox"
                    ? t("settings.emailTemplates.replyShared", {
                        address: delivery.replyToAddress ?? "",
                      })
                    : t("settings.emailTemplates.replyNone")}
                </Badge>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("settings.emailTemplates.customized")}</span>
                <span className="tnum text-foreground/90">
                  {modifiedCount === 0
                    ? t("settings.emailTemplates.allDefault")
                    : t("settings.emailTemplates.modifiedCount", { count: modifiedCount })}
                </span>
              </p>
              {delivery.configuredReplyMode !== delivery.replyMode ? (
                <Warning text={t("settings.emailTemplates.replyFallbackWarning")} />
              ) : null}
              {!delivery.publicUrlConfigured ? (
                <Warning text={t("settings.emailTemplates.publicUrlWarning")} testId="public-url-warning" />
              ) : null}
              {!delivery.hasSmtpTransport ? (
                <Warning text={t("settings.emailTemplates.smtpMissingWarning")} />
              ) : null}
            </>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="mt-1"
            disabled={overview === null}
            onClick={() => navigate("/admin/email-templates")}
          >
            <Mail size={13} />
            {t("settings.emailTemplates.open")}
          </Button>
        </div>
      </Card>
    </>
  );
}

export function Warning({ text, testId }: { readonly text: string; readonly testId?: string }) {
  return (
    <p
      className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-[11.5px] leading-5 text-warning"
      data-testid={testId}
    >
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

