import { FileSearch, Loader2, PlayCircle, PlugZap, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DirectorySyncPlanReview } from "@/components/organizational-units/directory-sync-plan-review";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  errorTextClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/relative-time";
import { useToast } from "@/components/ui/toast";
import { directorySyncErrorKey, type DirectorySyncErrorKey } from "@/lib/directory/directory-sync-error-key";
import {
  applyDirectoryDryRun,
  getDirectorySyncRunPlan,
  listDirectorySyncRuns,
  runDirectoryDryRun,
  testDirectoryConnection,
  type DirectorySyncPlan,
  type DirectorySyncRun,
  type DirectoryTestConnectionResult,
  type LdapsSyncStatus,
} from "@/services/directory-sync-api";

/*
  Paket 1.8 (A3/A4): LDAPS sync console for SUPER_ADMIN.
  Flow: test connection → dry-run (plan valid 24 h) → review / CSV → apply.
  Apply is offered only for a fresh, successful dry-run whose safeguard did not
  trip; the backend re-checks all of that, the UI only avoids dead buttons.
*/

type OpenPlan = {
  readonly runId: string;
  readonly plan: DirectorySyncPlan;
  /** ISO time until which the plan may be applied; null = history view only. */
  readonly applicableUntil: string | null;
};

type Busy = "test" | "dryRun" | "apply" | "plan" | null;

interface LdapsDirectorySyncPanelProperties {
  readonly status: LdapsSyncStatus | null;
  readonly onChanged: () => Promise<void>;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  RUNNING: "info",
  SUCCEEDED: "success",
  FAILED: "danger",
  ABORTED_SAFEGUARD: "warning",
};

export function LdapsDirectorySyncPanel({ status, onChanged }: LdapsDirectorySyncPanelProperties) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [runs, setRuns] = useState<readonly DirectorySyncRun[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [errorKey, setErrorKey] = useState<DirectorySyncErrorKey | null>(null);
  const [testResult, setTestResult] = useState<DirectoryTestConnectionResult | null>(null);
  const [openPlan, setOpenPlan] = useState<OpenPlan | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const reloadRuns = useCallback(async () => {
    try {
      setRuns(await listDirectorySyncRuns());
    } catch (error) {
      setErrorKey(directorySyncErrorKey(error));
    }
  }, []);

  useEffect(() => {
    void reloadRuns();
  }, [reloadRuns]);

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(kind);
    setErrorKey(null);
    try {
      await action();
    } catch (error) {
      setErrorKey(directorySyncErrorKey(error));
    } finally {
      setBusy(null);
      await reloadRuns();
    }
  };

  const handleTest = () =>
    run("test", async () => {
      setTestResult(null);
      setTestResult(await testDirectoryConnection());
    });

  const handleDryRun = () =>
    run("dryRun", async () => {
      const result = await runDirectoryDryRun();
      setOpenPlan({ runId: result.runId, plan: result.plan, applicableUntil: result.applicableUntil });
    });

  const handleOpenRunPlan = (runId: string) =>
    run("plan", async () => {
      const plan = await getDirectorySyncRunPlan(runId);
      setOpenPlan({ runId, plan, applicableUntil: null });
    });

  const handleApply = () => {
    if (openPlan === null) return;
    const dryRunId = openPlan.runId;
    setConfirmOpen(false);
    void run("apply", async () => {
      const result = await applyDirectoryDryRun(dryRunId);
      const failures = result.result.failures?.length ?? 0;
      toast({
        tone: failures > 0 ? "warning" : "success",
        title: t("directory.ldaps.applyDone"),
        description: failures > 0 ? t("directory.ldaps.applyFailures", { count: failures }) : undefined,
      });
      setOpenPlan(null);
      await onChanged();
    });
  };

  const planIsApplicable =
    openPlan !== null &&
    openPlan.applicableUntil !== null &&
    new Date(openPlan.applicableUntil).getTime() > Date.now() &&
    !openPlan.plan.safeguard.tripped;

  const configured = status !== null && status.missing.length === 0;
  const backoffActive =
    status?.backoff.retryAt != null && new Date(status.backoff.retryAt).getTime() > Date.now();

  const kindLabel = (kind: DirectorySyncRun["kind"]): string => {
    switch (kind) {
      case "TEST_CONNECTION":
        return t("directory.ldaps.kindTest");
      case "DRY_RUN":
        return t("directory.ldaps.kindDryRun");
      case "APPLY":
        return t("directory.ldaps.kindApply");
      case "SCHEDULED":
        return t("directory.ldaps.kindScheduled");
    }
  };

  const statusLabel = (value: string): string => {
    switch (value) {
      case "RUNNING":
        return t("directory.ldaps.statusRunning");
      case "SUCCEEDED":
        return t("directory.ldaps.statusSucceeded");
      case "FAILED":
        return t("directory.ldaps.statusFailed");
      case "ABORTED_SAFEGUARD":
        return t("directory.ldaps.statusAborted");
      default:
        return value;
    }
  };

  return (
    <Card className="fade-in" data-testid="ldaps-sync-panel">
      <CardHeader
        title={t("directory.ldaps.title")}
        subtitle={t("directory.ldaps.subtitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="xs"
              disabled={busy !== null || !configured}
              onClick={() => void handleTest()}
            >
              {busy === "test" ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
              {t("directory.ldaps.testConnection")}
            </Button>
            <Button
              size="xs"
              disabled={busy !== null || !configured}
              onClick={() => void handleDryRun()}
            >
              {busy === "dryRun" ? <Loader2 size={12} className="animate-spin" /> : <FileSearch size={12} />}
              {t("directory.ldaps.dryRun")}
            </Button>
          </div>
        }
      />
      <div className="space-y-4 px-4 py-4 text-[12px]">
        {status === null ? null : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
            <SummaryItem label={t("directory.ldaps.domainControllers")} value={status.domainControllers.join(", ") || "—"} />
            <SummaryItem label={t("directory.ldaps.usersBaseDn")} value={status.usersBaseDn || "—"} />
            <SummaryItem
              label={t("directory.ldaps.bind")}
              value={status.bindConfigured ? t("directory.ldaps.bindConfigured") : t("directory.ldaps.bindMissing")}
            />
            <SummaryItem
              label={t("directory.ldaps.certificate")}
              value={status.customCaCertificate ? t("directory.ldaps.certificateCustom") : t("directory.ldaps.certificateSystem")}
            />
            <SummaryItem label={t("directory.ldaps.schedule")} value={status.scheduleCron} mono />
            <SummaryItem label={t("directory.ldaps.roleSource")} value={status.roleSource} />
            <SummaryItem
              label={t("directory.ldaps.safeguard")}
              value={t("directory.ldaps.safeguardValue", { percent: status.maxDeactivationPercent })}
            />
            <SummaryItem
              label={t("directory.ldaps.cooldown")}
              value={t("directory.ldaps.cooldownValue", { minutes: status.syncCooldownMinutes })}
            />
            <SummaryItem label={t("directory.ldaps.pageSize")} value={String(status.pageSize)} />
          </dl>
        )}

        {status !== null && status.missing.length > 0 ? (
          <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-foreground">
            {t("directory.ldaps.missingSettings", { keys: status.missing.join(", ") })}
          </p>
        ) : null}
        {backoffActive && status?.backoff.retryAt ? (
          <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-foreground">
            {t("directory.ldaps.backoffActive", {
              time: new Date(status.backoff.retryAt).toLocaleTimeString(i18n.language),
              code: status.backoff.lastErrorCode ?? "—",
            })}
          </p>
        ) : null}

        {errorKey ? (
          <p role="alert" className={errorTextClassName}>
            {t(errorKey)}
          </p>
        ) : null}

        {testResult ? (
          <div role="status" className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-foreground">
            <p className="font-medium">
              {t("directory.ldaps.testOk", { url: testResult.url, ms: testResult.durationMs })}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {testResult.baseFound ? t("directory.ldaps.testBaseFound") : t("directory.ldaps.testBaseMissing")}
              {testResult.failedUrls.length > 0
                ? ` · ${t("directory.ldaps.testFailover", {
                    urls: testResult.failedUrls.map((entry) => `${entry.url} (${entry.code})`).join(", "),
                  })}`
                : ""}
            </p>
          </div>
        ) : null}

        {openPlan ? (
          <section aria-label={t("directory.ldaps.planHeading")} className="rounded-md border border-border/70 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-foreground">{t("directory.ldaps.planHeading")}</h3>
              <p className="text-[11.5px] text-muted-foreground">
                {openPlan.applicableUntil
                  ? t("directory.ldaps.planValidUntil", {
                      time: new Date(openPlan.applicableUntil).toLocaleString(i18n.language),
                    })
                  : t("directory.ldaps.planHistoryOnly")}
              </p>
            </div>
            <DirectorySyncPlanReview
              runId={openPlan.runId}
              plan={openPlan.plan}
              footer={
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => setOpenPlan(null)}>
                    {t("directory.ldaps.closePlan")}
                  </Button>
                  {openPlan.applicableUntil !== null ? (
                    <Button
                      size="sm"
                      disabled={busy !== null || !planIsApplicable}
                      onClick={() => setConfirmOpen(true)}
                    >
                      {busy === "apply" ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
                      {t("directory.ldaps.apply")}
                    </Button>
                  ) : null}
                </div>
              }
            />
          </section>
        ) : null}

        <section aria-label={t("directory.ldaps.historyHeading")}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-foreground">{t("directory.ldaps.historyHeading")}</h3>
            <Button variant="ghost" size="xs" disabled={busy !== null} onClick={() => void reloadRuns()}>
              <RefreshCw size={12} /> {t("directory.ldaps.historyRefresh")}
            </Button>
          </div>
          {runs.length === 0 ? (
            <p className="text-muted-foreground">{t("directory.ldaps.historyEmpty")}</p>
          ) : (
            <div className={tableWrapClassName}>
              <table className="w-full min-w-[720px] text-left text-[12.5px]">
                <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
                  <tr>
                    <th className="px-3 py-2">{t("directory.ldaps.columnTime")}</th>
                    <th className="px-3 py-2">{t("directory.ldaps.columnKind")}</th>
                    <th className="px-3 py-2">{t("directory.ldaps.columnStatus")}</th>
                    <th className="px-3 py-2">{t("directory.ldaps.columnActor")}</th>
                    <th className="px-3 py-2">{t("directory.ldaps.columnSummary")}</th>
                    <th className="px-3 py-2" aria-label={t("directory.ldaps.columnActions")} />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((entry) => (
                    <tr key={entry.id} className={tableRowClassName}>
                      <td className="whitespace-nowrap px-3">
                        <RelativeTime value={entry.startedAt} locale={i18n.language} />
                      </td>
                      <td className="whitespace-nowrap px-3">{kindLabel(entry.kind)}</td>
                      <td className="whitespace-nowrap px-3">
                        <Badge tone={STATUS_TONE[entry.status] ?? "neutral"} dot={false}>
                          {statusLabel(entry.status)}
                        </Badge>
                      </td>
                      <td className="max-w-[160px] truncate px-3 text-muted-foreground">
                        {entry.actorName ?? t("directory.ldaps.actorSystem")}
                      </td>
                      <td className="max-w-[280px] truncate px-3 text-[12px] text-muted-foreground">
                        {runSummaryText(entry, (counts) => t("directory.ldaps.runSummary", counts))}
                      </td>
                      <td className="whitespace-nowrap px-3 text-right">
                        {(entry.kind === "DRY_RUN" || entry.kind === "SCHEDULED") &&
                        entry.status !== "FAILED" &&
                        entry.status !== "RUNNING" ? (
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={busy !== null}
                            onClick={() => void handleOpenRunPlan(entry.id)}
                          >
                            {t("directory.ldaps.openPlan")}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("directory.ldaps.confirmTitle")}
        description={
          openPlan
            ? t("directory.ldaps.confirmBody", {
                create: openPlan.plan.users.create.length,
                update: openPlan.plan.users.update.length + openPlan.plan.users.reactivate.length,
                deactivate: openPlan.plan.users.deactivate.length,
                units: openPlan.plan.organizationalUnits.create.length + openPlan.plan.organizationalUnits.update.length,
              })
            : undefined
        }
        confirmLabel={t("directory.ldaps.apply")}
        intent={openPlan !== null && openPlan.plan.users.deactivate.length > 0 ? "danger" : "default"}
        isPending={busy === "apply"}
        onConfirm={handleApply}
      />
    </Card>
  );
}

function SummaryItem({ label, value, mono = false }: { readonly label: string; readonly value: string; readonly mono?: boolean }) {
  return (
    <div className="flex min-w-0 justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`truncate text-foreground/90 ${mono ? "font-mono text-[11.5px]" : ""}`} title={value}>
        {value}
      </dd>
    </div>
  );
}

type RunSummaryCounts = {
  readonly create: number;
  readonly update: number;
  readonly deactivate: number;
  readonly exceptions: number;
};

function runSummaryText(
  entry: DirectorySyncRun,
  format: (counts: RunSummaryCounts) => string,
): string {
  if (entry.errorCode) {
    return entry.errorCode;
  }
  const summary = entry.summary;
  if (summary === null || summary.usersCreated === undefined) {
    return entry.durationMs === null ? "—" : `${entry.durationMs} ms`;
  }
  return format({
    create: summary.usersCreated ?? 0,
    update: (summary.usersUpdated ?? 0) + (summary.usersReactivated ?? 0),
    deactivate: summary.usersDeactivated ?? 0,
    exceptions: summary.exceptions ?? 0,
  });
}
