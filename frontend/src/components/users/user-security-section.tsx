import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SessionsList } from "@/components/account-security/sessions-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useLocale } from "@/i18n/use-locale";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import { ApiError } from "@/services/api";
import {
  getUserSecurity,
  resetUserMfa,
  revokeUserSessions,
  type UserSecurity,
} from "@/services/account-security-api";

/**
 * Paket 2.1 (M5/M6): administrator view — MFA state, password age, active
 * sessions; reset MFA (with a reason, audited) and end every session.
 */
export function UserSecuritySection({ userId }: { readonly userId: string }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { toast } = useToast();
  const [security, setSecurity] = useState<UserSecurity | null>(null);
  const [error, setError] = useState<"forbidden" | "failed" | null>(null);
  const [dialog, setDialog] = useState<"reset" | "revoke" | null>(null);
  const [reason, setReason] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSecurity(await getUserSecurity(userId));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 403 ? "forbidden" : "failed");
    }
  }, [userId]);

  useEffect(() => {
    setSecurity(null);
    void load();
  }, [load]);

  if (error) {
    return (
      <p className={error === "forbidden" ? "text-[12.5px] text-muted-foreground" : errorTextClassName}>
        {t(error === "forbidden" ? "users.security.forbidden" : "users.security.loadFailed")}
      </p>
    );
  }
  if (security === null) return null;

  const run = async (action: () => Promise<unknown>, successKey: "users.security.mfaResetDone" | "users.security.sessionsRevokedDone") => {
    setIsBusy(true);
    try {
      await action();
      toast({ tone: "success", title: t(successKey) });
      setDialog(null);
      setReason("");
      await load();
    } catch {
      toast({ tone: "danger", title: t("account.security.actionFailed") });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="user-security-section">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
        <dt className="text-muted-foreground">{t("users.security.mfa")}</dt>
        <dd className="flex flex-wrap items-center gap-1.5">
          {security.mfa.requirement === "unavailable" && !security.mfa.enabled ? (
            <Badge>{t("users.security.mfaNotApplicable")}</Badge>
          ) : security.mfa.enabled ? (
            <Badge tone="success" dot>
              {t("account.security.mfaOn")}
            </Badge>
          ) : (
            <Badge tone={security.mfa.requirement === "required" ? "danger" : "neutral"} dot>
              {t("account.security.mfaOff")}
            </Badge>
          )}
          {security.mfa.requirement === "required" ? <Badge tone="warning">{t("account.security.mfaRequired")}</Badge> : null}
          {security.mfa.enabled ? (
            <span className="text-muted-foreground">
              {t("account.security.recoveryRemaining", { count: security.mfa.recoveryCodesRemaining })}
            </span>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">{t("users.security.passwordChanged")}</dt>
        <dd>{security.passwordChangedAt ? formatTicketTimestamp(security.passwordChangedAt, locale) : "—"}</dd>
        {security.passwordExpiresAt ? (
          <>
            <dt className="text-muted-foreground">{t("users.security.passwordExpires")}</dt>
            <dd>{formatTicketTimestamp(security.passwordExpiresAt, locale)}</dd>
          </>
        ) : null}
      </dl>
      <div>
        <p className="mb-1 text-[12px] font-medium text-foreground">
          {t("users.security.activeSessions", { count: security.sessions.length })}
        </p>
        <div className="rounded-lg border border-border/70 px-3">
          <SessionsList sessions={security.sessions} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {security.mfa.enabled ? (
          <Button type="button" variant="danger" size="sm" onClick={() => setDialog("reset")}>
            {t("users.security.resetMfa")}
          </Button>
        ) : null}
        {security.sessions.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setDialog("revoke")}>
            {t("users.security.revokeAll")}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={dialog === "reset"}
        onOpenChange={(open) => setDialog(open ? "reset" : null)}
        title={t("users.security.resetMfa")}
        description={t("users.security.resetMfaHint")}
        confirmLabel={t("users.security.resetMfaConfirm")}
        intent="danger"
        isPending={isBusy || reason.trim().length < 5}
        onConfirm={() => void run(() => resetUserMfa(userId, reason.trim()), "users.security.mfaResetDone")}
      >
        <Field label={t("users.security.reason")} required hint={t("users.security.reasonHint")}>
          <Textarea rows={2} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "revoke"}
        onOpenChange={(open) => setDialog(open ? "revoke" : null)}
        title={t("users.security.revokeAll")}
        description={t("users.security.revokeAllHint")}
        confirmLabel={t("users.security.revokeAllConfirm")}
        intent="danger"
        isPending={isBusy}
        onConfirm={() => void run(() => revokeUserSessions(userId), "users.security.sessionsRevokedDone")}
      />
    </div>
  );
}
