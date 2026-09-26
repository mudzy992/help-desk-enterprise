import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MfaSection } from "@/components/account-security/mfa-section";
import { PasswordSection } from "@/components/account-security/password-section";
import { SessionsList } from "@/components/account-security/sessions-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName } from "@/components/ui/control";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/i18n/use-locale";
import { queryKeys } from "@/lib/query/query-keys";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import {
  getAccountSecurity,
  listOwnSessions,
  revokeOtherSessions,
  revokeOwnSession,
  type UserSession,
} from "@/services/account-security-api";

/**
 * Paket 2.1: "Moj profil → Sigurnost naloga" — password, two-step
 * verification and active sessions of the signed-in user.
 */
export function AccountSecurityPage() {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const overview = useQuery({ queryKey: queryKeys.accountSecurity, queryFn: getAccountSecurity });
  const [sessions, setSessions] = useState<readonly UserSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      setSessions((await listOwnSessions()).items);
      setSessionsError(false);
    } catch {
      setSessionsError(true);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.accountSecurity });
    void loadSessions();
  };

  const data = overview.data;
  const expiresAt = data?.password.expiresAt ?? null;

  return (
    <div className="page-in mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <PageHeader
        crumbs={[t("account.security.crumb")]}
        title={t("account.security.title")}
        subtitle={t("account.security.subtitle")}
      />
      {overview.isError ? (
        <p className={errorTextClassName} role="alert">
          {t("account.security.loadFailed")}
        </p>
      ) : null}
      {data ? (
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("account.security.mfaTitle")} subtitle={t("account.security.mfaSubtitle")} />
            <div className="p-4">
              <MfaSection mfa={data.mfa} onChanged={refresh} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("account.security.passwordTitle")}
              subtitle={
                data.password.changedAt
                  ? t("account.security.passwordChangedAt", {
                      date: formatTicketTimestamp(data.password.changedAt, locale),
                    })
                  : undefined
              }
              actions={
                expiresAt ? (
                  <Badge tone={Date.parse(expiresAt) - Date.now() < 14 * 86_400_000 ? "warning" : "neutral"}>
                    {t("account.security.passwordExpiresAt", { date: formatTicketTimestamp(expiresAt, locale) })}
                  </Badge>
                ) : null
              }
            />
            <div className="p-4">
              {data.password.hasLocalPassword ? (
                <PasswordSection password={data.password} onChanged={refresh} />
              ) : (
                <p className="text-[12.5px] text-muted-foreground">{t("account.security.passwordExternal")}</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("account.security.sessionsTitle")}
              subtitle={t("account.security.sessionsSubtitle")}
              actions={
                sessions && sessions.some((session) => !session.current) ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmOthers(true)}>
                    {t("account.security.revokeOthers")}
                  </Button>
                ) : null
              }
            />
            <div className="px-4 py-2">
              {sessionsError ? (
                <p className={errorTextClassName} role="alert">
                  {t("account.security.loadFailed")}
                </p>
              ) : sessions ? (
                <SessionsList
                  sessions={sessions}
                  busySessionId={busySessionId}
                  onRevoke={(session) => {
                    setBusySessionId(session.id);
                    void revokeOwnSession(session.id)
                      .then(() => {
                        toast({ tone: "success", title: t("account.security.sessionRevoked") });
                        return loadSessions();
                      })
                      .catch(() => toast({ tone: "danger", title: t("account.security.actionFailed") }))
                      .finally(() => setBusySessionId(null));
                  }}
                />
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOthers}
        onOpenChange={setConfirmOthers}
        title={t("account.security.revokeOthers")}
        description={t("account.security.revokeOthersHint")}
        confirmLabel={t("account.security.revokeOthersConfirm")}
        intent="danger"
        onConfirm={() => {
          setConfirmOthers(false);
          void revokeOtherSessions()
            .then((result) => {
              toast({ tone: "success", title: t("account.security.othersRevoked", { count: result.revoked }) });
              return loadSessions();
            })
            .catch(() => toast({ tone: "danger", title: t("account.security.actionFailed") }));
        }}
      />
    </div>
  );
}
