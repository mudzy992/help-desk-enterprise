import { Inbox, PlugZap, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Warning } from "@/components/settings/email-templates-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { RelativeTime } from "@/components/ui/relative-time";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { toInboundProblemKeys, toInboundReasonKey } from "@/lib/settings/inbound-email-labels";
import {
  getInboundEmailStatus,
  testInboundEmailConnection,
  type InboundEmailConnectionTest,
  type InboundEmailLogEntry,
  type InboundEmailStatus,
} from "@/services/inbound-email-api";

const statusTones: Readonly<Record<InboundEmailLogEntry["status"], BadgeTone>> = {
  PROCESSING: "info",
  PROCESSED: "success",
  REJECTED: "danger",
  IGNORED: "neutral",
  FAILED: "warning",
};

/** Paket 2.3 (R13): inbound mailbox health, connection test and the recent log (no message bodies). */
export function InboundEmailCard() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<InboundEmailStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [test, setTest] = useState<InboundEmailConnectionTest | null>(null);
  const [testing, setTesting] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      setStatus(await getInboundEmailStatus());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const runTest = async () => {
    setTesting(true);
    try {
      setTest(await testInboundEmailConnection());
    } catch (error) {
      setTest({ ok: false, error: error instanceof Error ? error.message : String(error), problems: [] });
    } finally {
      setTesting(false);
    }
  };

  const state = status?.state ?? null;
  const healthy = state !== null && state.consecutiveFails === 0 && state.lastSuccessAt !== null;
  return (
    <Card className="fade-in" data-testid="inbound-email-card">
      <CardHeader title={t("settings.inboundEmail.title")} subtitle={t("settings.inboundEmail.subtitle")} />
      <div className="space-y-2.5 px-4 pb-4 pt-4 text-[12px]">
        {loadError !== null ? <p className="text-danger">{loadError}</p> : null}
        {status !== null ? (
          <>
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("settings.inboundEmail.state")}</span>
              <Badge tone={!status.enabled ? "neutral" : healthy ? "success" : state === null ? "info" : "danger"} dot>
                {!status.enabled
                  ? t("settings.inboundEmail.disabled")
                  : healthy
                    ? t("settings.inboundEmail.healthy")
                    : state === null
                      ? t("settings.inboundEmail.waiting")
                      : t("settings.inboundEmail.failing", { count: state.consecutiveFails })}
              </Badge>
            </p>
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("settings.inboundEmail.mailbox")}</span>
              <span className="text-foreground/90">
                {status.address.length > 0 ? status.address : "—"} · {t(`settings.inboundEmail.providers.${status.provider}`)}
              </span>
            </p>
            {state?.lastSuccessAt ? (
              <p className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("settings.inboundEmail.lastSuccess")}</span>
                <RelativeTime value={state.lastSuccessAt} locale={i18n.language} className="text-foreground/90" />
              </p>
            ) : null}
            <p className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("settings.inboundEmail.last24h")}</span>
              <span className="tnum text-foreground/90">
                {t("settings.inboundEmail.counts", {
                  processed: status.last24h.processed,
                  rejected: status.last24h.rejected + status.last24h.failed,
                  ignored: status.last24h.ignored,
                })}
              </span>
            </p>
            {status.enabled && state?.lastError && state.consecutiveFails > 0 ? (
              <Warning text={t("settings.inboundEmail.lastError", { error: state.lastError })} />
            ) : null}
            {status.enabled
              ? toInboundProblemKeys(status.problems).map((problem) => (
                  <Warning key={problem} text={t(`settings.inboundEmail.problems.${problem}`)} />
                ))
              : null}
            {status.enabled && !status.replyModeReady ? (
              <Warning text={t("settings.inboundEmail.replyModeWarning")} testId="inbound-reply-mode-warning" />
            ) : null}
            {status.enabled && !status.replyTokenReady ? (
              <Warning text={t("settings.inboundEmail.tokenWarning")} />
            ) : null}
            {test !== null ? (
              test.ok ? (
                <p className="rounded-md border border-success/30 bg-success/10 px-2.5 py-2 text-[11.5px] text-ok" role="status">
                  {t("settings.inboundEmail.testOk", { count: test.inboxCount ?? 0 })}
                </p>
              ) : (
                <Warning
                  text={
                    test.error ??
                    toInboundProblemKeys(test.problems)
                      .map((problem) => t(`settings.inboundEmail.problems.${problem}`))
                      .join(" ")
                  }
                />
              )
            ) : null}
          </>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" size="xs" variant="outline" disabled={status === null || testing} onClick={() => void runTest()}>
            <PlugZap size={13} />
            {testing ? t("settings.inboundEmail.testing") : t("settings.inboundEmail.test")}
          </Button>
          <Button type="button" size="xs" variant="outline" disabled={status === null} onClick={() => setLogOpen(true)}>
            <Inbox size={13} />
            {t("settings.inboundEmail.openLog")}
          </Button>
          <Button type="button" size="xs" variant="ghost" onClick={() => void reload()} aria-label={t("settings.inboundEmail.refresh")}>
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>
      <Sheet open={logOpen} onOpenChange={setLogOpen}>
        <SheetContent side="right" className="flex w-full max-w-xl flex-col p-0">
          <div className="border-b border-border px-5 py-4 pr-12">
            <SheetTitle className="text-[15px] font-semibold text-foreground">{t("settings.inboundEmail.logTitle")}</SheetTitle>
            <SheetDescription className="mt-1 text-[12px] leading-5 text-muted-foreground">
              {t("settings.inboundEmail.logSubtitle")}
            </SheetDescription>
          </div>
          <ul className="flex-1 space-y-2 overflow-y-auto px-5 py-4 text-[12px]" data-testid="inbound-email-log">
            {(status?.recent ?? []).length === 0 ? (
              <li className="py-10 text-center text-muted-foreground">{t("settings.inboundEmail.logEmpty")}</li>
            ) : null}
            {(status?.recent ?? []).map((entry) => {
              const reason = toInboundReasonKey(entry.reason);
              return (
                <li key={entry.id} className="space-y-1.5 rounded-lg border border-border bg-elevated/40 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge tone={statusTones[entry.status]}>{t(`settings.inboundEmail.statuses.${entry.status}`)}</Badge>
                    <RelativeTime value={entry.createdAt} locale={i18n.language} className="text-[11px] text-muted-foreground" />
                  </div>
                  <p className="truncate font-medium text-foreground/90">{entry.subject.length > 0 ? entry.subject : "—"}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                    <span className="break-all">{entry.fromAddress ?? "—"}</span>
                    {reason !== null ? <span>· {t(`settings.inboundEmail.reasons.${reason}`)}</span> : null}
                    {entry.ticketId !== null ? (
                      <Link className="text-link hover:underline" to={`/tickets/${entry.ticketId}`}>
                        · {entry.ticketNumber ?? t("settings.inboundEmail.ticket")}
                      </Link>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
