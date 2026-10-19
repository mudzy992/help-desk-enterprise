import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MfaSection } from "@/components/account-security/mfa-section";
import { PasskeySection } from "@/components/account-security/passkey-section";
import { PasswordSection } from "@/components/account-security/password-section";
import { SessionsList } from "@/components/account-security/sessions-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName } from "@/components/ui/control";
import { PageHeader } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/i18n/use-locale";
import { queryKeys } from "@/lib/query/query-keys";
import { usePlatformPasskeyAvailable } from "@/lib/webauthn/use-passkey-availability";
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
  const sessions = useQuery({ queryKey: queryKeys.accountSessions, queryFn: listOwnSessions });
  const platformPasskey = usePlatformPasskeyAvailable();
  const [confirmOthers, setConfirmOthers] = useState(false);
  const [sessionToRevoke, setSessionToRevoke] = useState<UserSession | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.accountSecurity });
    void queryClient.invalidateQueries({ queryKey: queryKeys.accountSessions });
  };

  const revokeSession = useMutation({
    mutationFn: (sessionId: string) => revokeOwnSession(sessionId),
    onSuccess: async () => {
      toast({ tone: "success", title: t("account.security.sessionRevoked") });
      await queryClient.invalidateQueries({ queryKey: queryKeys.accountSessions });
    },
    onError: () => toast({ tone: "danger", title: t("account.security.actionFailed") }),
  });

  const revokeOthers = useMutation({
    mutationFn: () => revokeOtherSessions(),
    onSuccess: async (result) => {
      toast({
        tone: "success",
        title: t("account.security.othersRevoked", { count: result.revoked }),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.accountSessions });
    },
    onError: () => toast({ tone: "danger", title: t("account.security.actionFailed") }),
  });

  const data = overview.data;
  const expiresAt = data?.password.expiresAt ?? null;

  return (
    <div className="page-in mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <PageHeader
        crumbs={[t("account.security.crumb")]}
        title={t("account.security.title")}
        subtitle={t("account.security.subtitle")}
      />
      {overview.isPending ? <PanelSkeleton label={t("account.security.loading")} /> : null}
      {overview.isError ? (
        <div className="space-y-2" role="alert">
          <p className={errorTextClassName}>{t("account.security.loadFailed")}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void overview.refetch()}>
            {t("account.security.retry")}
          </Button>
        </div>
      ) : null}
      {data ? (
        <div className="space-y-5">
          <Card>
            <CardHeader
              title={t("account.security.mfaTitle")}
              subtitle={t("account.security.mfaSubtitle")}
            />
            <div className="p-4">
              <MfaSection mfa={data.mfa} passkeyCount={data.passkeys.length} onChanged={refresh} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("account.passkeys.title")}
              subtitle={t("account.passkeys.subtitle")}
            />
            <div className="p-4">
              {platformPasskey.isLoading ? null : (
                <PasskeySection
                  passkeys={data.passkeys}
                  hasTotp={data.hasTotp}
                  canUsePasskeys={platformPasskey.available}
                  onChanged={refresh}
                />
              )}
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
                  <Badge
                    tone={
                      Date.parse(expiresAt) - Date.now() < 14 * 86_400_000 ? "warning" : "neutral"
                    }
                  >
                    {t("account.security.passwordExpiresAt", {
                      date: formatTicketTimestamp(expiresAt, locale),
                    })}
                  </Badge>
                ) : null
              }
            />
            <div className="p-4">
              {data.password.hasLocalPassword ? (
                <PasswordSection password={data.password} onChanged={refresh} />
              ) : (
                <p className="text-[12.5px] text-muted-foreground">
                  {t("account.security.passwordExternal")}
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={t("account.security.sessionsTitle")}
              subtitle={t("account.security.sessionsSubtitle")}
              actions={
                sessions.data?.items.some((session) => !session.current) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={revokeOthers.isPending}
                    onClick={() => setConfirmOthers(true)}
                  >
                    {t("account.security.revokeOthers")}
                  </Button>
                ) : null
              }
            />
            <div className="px-4 py-2">
              {sessions.isPending ? <PanelSkeleton label={t("account.security.loading")} /> : null}
              {sessions.isError ? (
                <div className="space-y-2" role="alert">
                  <p className={errorTextClassName}>{t("account.security.loadFailed")}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void sessions.refetch()}
                  >
                    {t("account.security.retry")}
                  </Button>
                </div>
              ) : null}
              {sessions.data ? (
                <SessionsList
                  sessions={sessions.data.items}
                  busySessionId={revokeSession.isPending ? revokeSession.variables : null}
                  onRevoke={setSessionToRevoke}
                />
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}
      <ConfirmDialog
        open={sessionToRevoke !== null}
        onOpenChange={(open) => {
          if (!open) setSessionToRevoke(null);
        }}
        title={t("account.security.revokeSession")}
        description={t("account.security.revokeSessionHint")}
        confirmLabel={t("account.security.revoke")}
        intent="danger"
        onConfirm={() => {
          const session = sessionToRevoke;
          setSessionToRevoke(null);
          if (session === null) return;
          revokeSession.mutate(session.id);
        }}
      />
      <ConfirmDialog
        open={confirmOthers}
        onOpenChange={setConfirmOthers}
        title={t("account.security.revokeOthers")}
        description={t("account.security.revokeOthersHint")}
        confirmLabel={t("account.security.revokeOthersConfirm")}
        intent="danger"
        onConfirm={() => {
          setConfirmOthers(false);
          revokeOthers.mutate();
        }}
      />
    </div>
  );
}
