import { LogOut, Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { useLocale } from "@/i18n/use-locale";
import { describeUserAgent, formatDevice } from "@/lib/auth/describe-user-agent";
import type { UserSession } from "@/services/account-security-api";

interface SessionsListProperties {
  readonly sessions: readonly UserSession[];
  /** Omitted in the admin view: there sessions end all at once. */
  readonly onRevoke?: (session: UserSession) => void;
  readonly busySessionId?: string | null;
}

/** Paket 2.1 (M6): active sign-ins — device, network, last activity. */
export function SessionsList({ sessions, onRevoke, busySessionId = null }: SessionsListProperties) {
  const { t } = useTranslation();
  const { locale } = useLocale();

  if (sessions.length === 0) {
    return <p className="text-[12.5px] text-muted-foreground">{t("account.security.sessionsEmpty")}</p>;
  }

  return (
    <ul className="divide-y divide-border/70" data-testid="sessions-list">
      {sessions.map((session) => (
        <li key={session.id} className="flex items-start gap-3 py-2.5">
          <Monitor size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-foreground">
              {formatDevice(describeUserAgent(session.userAgent), t("account.security.unknownDevice"))}
              {session.current ? <Badge tone="success">{t("account.security.thisDevice")}</Badge> : null}
              {session.provider === "entra" ? <Badge tone="accent">Microsoft</Badge> : null}
              {session.mfaMethod ? <Badge tone="primary">MFA</Badge> : null}
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {session.ipAddress ?? "—"} · {t("account.security.lastActive")}{" "}
              <RelativeTime value={session.lastSeenAt} locale={locale} /> · {t("account.security.signedIn")}{" "}
              <RelativeTime value={session.createdAt} locale={locale} />
            </p>
          </div>
          {onRevoke && !session.current ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busySessionId === session.id}
              onClick={() => onRevoke(session)}
              aria-label={t("account.security.revokeSession")}
            >
              <LogOut /> {t("account.security.revoke")}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
