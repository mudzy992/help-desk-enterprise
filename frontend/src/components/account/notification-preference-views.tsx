import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

export function NotificationAvailabilityNotices({
  editable,
  emailAvailable,
}: {
  readonly editable: boolean;
  readonly emailAvailable: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      {!editable ? (
        <p className="rounded-lg border border-border/70 bg-surface px-3 py-2 text-[12.5px] text-muted-foreground">
          {t("account.notifications.disabledByAdmin")}
        </p>
      ) : null}
      {!emailAvailable ? (
        <p className="rounded-lg border border-border/70 bg-surface px-3 py-2 text-[12.5px] text-muted-foreground">
          {t("account.notifications.emailUnavailable")}
        </p>
      ) : null}
    </>
  );
}

export function NotificationTeamsStatus({ connected }: { readonly connected: boolean }) {
  const { t } = useTranslation();
  return (
    <p
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2 text-[12.5px] text-muted-foreground"
      data-testid="teams-connection"
    >
      <span className="font-medium text-foreground">{t("account.notifications.teamsLabel")}</span>
      <Badge tone={connected ? "success" : "neutral"} dot>
        {connected
          ? t("account.notifications.teamsConnected")
          : t("account.notifications.teamsNotInstalled")}
      </Badge>
      {connected ? null : <span>{t("account.notifications.teamsInstallHint")}</span>}
    </p>
  );
}

export function NotificationLockHint({ alwaysOn }: { readonly alwaysOn: boolean }) {
  const { t } = useTranslation();
  const label = t(alwaysOn ? "account.notifications.alwaysOn" : "account.notifications.locked");
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
      title={label}
    >
      <Lock size={12} aria-hidden="true" />
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  );
}
