import { FileDown, FlaskConical, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  errorTextClassName,
  hintClassName,
  sectionTitleClassName,
  selectCompactClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { formatBytes } from "@/lib/privacy/privacy-view";
import {
  downloadRetentionRunRefs,
  getRetentionOverview,
  listRetentionRuns,
  retentionCategories,
  startRetentionDryRun,
  startRetentionRunNow,
  type RetentionCategory,
  type RetentionCategoryView,
  type RetentionOverview,
  type RetentionRun,
  type RetentionRunStatus,
} from "@/services/privacy-api";
import { PanelIntro, useDateFormat, usePrivacyFailure } from "./privacy-shared";
import { ScrollRegion } from "@/components/ui/scroll-region";

const runTones: Record<RetentionRunStatus, BadgeTone> = {
  RUNNING: "info",
  COMPLETED: "success",
  PARTIAL: "warning",
  FAILED: "danger",
  SKIPPED: "neutral",
};
export const categoryKey = (category: RetentionCategory) =>
  `privacy.retention.categories.${category}.name` as "privacy.retention.categories.sessions.name";
const categoryHintKey = (category: RetentionCategory) =>
  `privacy.retention.categories.${category}.hint` as "privacy.retention.categories.sessions.hint";
const runStatusKey = (status: RetentionRunStatus) =>
  `privacy.retention.runStatus.${status}` as "privacy.retention.runStatus.COMPLETED";

/** Paket 2.6 (§7, §11): per-category policy, mandatory dry run, run history with the CSV of references. */
export function PrivacyRetentionPanel({ canManage }: { readonly canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const { toast } = useToast();
  const fail = usePrivacyFailure();
  const [overview, setOverview] = useState<RetentionOverview | null>(null);
  const [runs, setRuns] = useState<readonly RetentionRun[] | null>(null);
  const [filter, setFilter] = useState<RetentionCategory | "all">("all");
  const [loadError, setLoadError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRun, setConfirmRun] = useState<RetentionCategoryView | null>(null);

  const reload = useCallback(async () => {
    try {
      const [loadedOverview, loadedRuns] = await Promise.all([
        getRetentionOverview(),
        listRetentionRuns(filter === "all" ? undefined : filter),
      ]);
      setOverview(loadedOverview);
      setRuns(loadedRuns);
      setLoadError(null);
    } catch (caught) {
      setLoadError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
    }
  }, [filter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const running = runs?.some((run) => run.status === "RUNNING") ?? false;
  const [queued, setQueued] = useState(0);
  useEffect(() => {
    if (!running && queued === 0) return;
    const timer = window.setInterval(() => {
      void reload();
      setQueued((value) => Math.max(0, value - 1));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [queued, reload, running]);

  const start = async (category: RetentionCategory, mode: "dry" | "execute") => {
    setBusy(`${category}:${mode}`);
    try {
      await (mode === "dry" ? startRetentionDryRun(category) : startRetentionRunNow(category));
      toast({
        title: mode === "dry" ? t("privacy.retention.dryRunQueued") : t("privacy.retention.runQueued"),
        tone: "success",
      });
      setConfirmRun(null);
      setQueued(5); // follow the job for ~20 s even before its run row appears
      await reload();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(null);
    }
  };

  const downloadRefs = async (run: RetentionRun) => {
    try {
      const file = await downloadRetentionRunRefs(run.id);
      triggerBlobDownload(file.blob, file.fileName ?? `retention-${run.id}.csv`);
    } catch (caught) {
      fail(caught);
    }
  };

  if (loadError !== null) return <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} />;
  if (overview === null || runs === null) return <PanelSkeleton className="mt-0" label={t("privacy.tabs.retention")} />;

  const number = new Intl.NumberFormat(i18n.language);
  const gateText = (view: RetentionCategoryView) =>
    view.gate.allowed
      ? t(`privacy.retention.gate.${view.gate.basis}` as "privacy.retention.gate.dry_run")
      : t(`privacy.retention.gate.${view.gate.reason}` as "privacy.retention.gate.disabled");

  return (
    <div className="flex flex-col gap-6" data-testid="privacy-retention">
      <PanelIntro>
        {t("privacy.retention.intro", {
          time: overview.runAtLocalTime,
          zone: overview.timeZone,
          minutes: overview.maxMinutesPerNight,
        })}{" "}
        <Link to="/admin?tab=settings" className="text-link hover:underline">
          {t("privacy.retention.settingsLink")}
        </Link>
      </PanelIntro>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {overview.categories.map((view) => (
          <div
            key={view.category}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-card"
            data-testid={`privacy-retention-${view.category}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className={sectionTitleClassName}>{t(categoryKey(view.category))}</h3>
                <p className={`${hintClassName} mt-0.5 leading-5`}>{t(categoryHintKey(view.category))}</p>
              </div>
              <Badge tone={view.enabled ? "success" : "neutral"} dot>
                {view.enabled
                  ? t("privacy.retention.days", { count: view.days })
                  : t("privacy.retention.disabled")}
              </Badge>
            </div>
            {view.enabled ? (
              <>
                <p className="text-[12px] text-foreground/90">{gateText(view)}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                  {view.requiresDryRun ? (
                    <>
                      <dt className="text-muted-foreground">{t("privacy.retention.lastDryRun")}</dt>
                      <dd>
                        {view.lastDryRun === null
                          ? "—"
                          : t("privacy.retention.runSummary", {
                              count: view.lastDryRun.itemCount,
                              formatted: number.format(view.lastDryRun.itemCount),
                              date: format.dateTime(view.lastDryRun.startedAt),
                            })}
                      </dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">{t("privacy.retention.lastExecution")}</dt>
                  <dd>
                    {view.lastExecution === null
                      ? "—"
                      : t("privacy.retention.runSummary", {
                          count: view.lastExecution.itemCount,
                          formatted: number.format(view.lastExecution.itemCount),
                          date: format.dateTime(view.lastExecution.startedAt),
                        })}
                  </dd>
                </dl>
                {canManage ? (
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void start(view.category, "dry")}
                      data-testid="privacy-retention-dry-run"
                    >
                      <FlaskConical size={13} /> {t("privacy.retention.dryRun")}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={busy !== null || !view.gate.allowed}
                      title={view.gate.allowed ? undefined : gateText(view)}
                      onClick={() => setConfirmRun(view)}
                      data-testid="privacy-retention-run-now"
                    >
                      <Play size={13} /> {t("privacy.retention.runNow")}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitleClassName}>{t("privacy.retention.runsTitle")}</h2>
          <select
            aria-label={t("privacy.retention.filter")}
            className={`${selectCompactClassName} max-w-[240px]`}
            value={filter}
            onChange={(event) => setFilter(event.target.value as RetentionCategory | "all")}
          >
            <option value="all">{t("privacy.retention.allCategories")}</option>
            {retentionCategories.map((category) => (
              <option key={category} value={category}>
                {t(categoryKey(category))}
              </option>
            ))}
          </select>
        </div>
        {runs.length === 0 ? (
          <p className={hintClassName}>{t("privacy.retention.runsEmpty")}</p>
        ) : (
          <ScrollRegion className={tableWrapClassName}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className={`${tableHeadClassName} border-b border-border/70`}>
                  <th className="px-3 py-2 text-left">{t("privacy.retention.columns.category")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.retention.columns.mode")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.retention.columns.status")}</th>
                  <th className="px-3 py-2 text-right">{t("privacy.retention.columns.items")}</th>
                  <th className="px-3 py-2 text-right">{t("privacy.retention.columns.freed")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.retention.columns.range")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.retention.columns.started")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className={tableRowClassName} data-testid="privacy-retention-run">
                    <td className="px-3 font-medium text-foreground">{t(categoryKey(run.category))}</td>
                    <td className="px-3 text-muted-foreground">
                      {run.mode === "DRY_RUN" ? t("privacy.retention.dryRun") : t("privacy.retention.execution")}
                      {run.configDays !== null ? ` · ${t("privacy.retention.days", { count: run.configDays })}` : ""}
                    </td>
                    <td className="px-3">
                      <Badge tone={runTones[run.status]} dot>
                        {t(runStatusKey(run.status))}
                      </Badge>
                      {run.error !== null ? (
                        <p className={`${errorTextClassName} mt-1 text-[11.5px]`}>{run.error}</p>
                      ) : null}
                    </td>
                    <td className="tnum px-3 text-right">{number.format(run.itemCount)}</td>
                    <td className="tnum px-3 text-right">{run.bytesFreed > 0 ? formatBytes(run.bytesFreed, i18n.language) : "—"}</td>
                    <td className="px-3 text-muted-foreground">
                      {run.oldestAt === null ? "—" : `${format.date(run.oldestAt)} – ${format.date(run.newestAt)}`}
                    </td>
                    <td className="px-3 text-muted-foreground">{format.dateTime(run.startedAt)}</td>
                    <td className="px-2 text-right">
                      {run.refsCount > 0 ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => void downloadRefs(run)}
                          title={run.refsTruncated ? t("privacy.retention.refsTruncated") : undefined}
                        >
                          <FileDown size={13} /> CSV
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </section>

      <ConfirmDialog
        open={confirmRun !== null}
        onOpenChange={(open) => !open && setConfirmRun(null)}
        title={t("privacy.retention.runNowTitle", { category: confirmRun === null ? "" : t(categoryKey(confirmRun.category)) })}
        description={t("privacy.retention.runNowBody", { count: confirmRun?.days ?? 0 })}
        confirmLabel={t("privacy.retention.runNow")}
        intent="danger"
        isPending={confirmRun !== null && busy === `${confirmRun.category}:execute`}
        onConfirm={() => confirmRun !== null && void start(confirmRun.category, "execute")}
      />
    </div>
  );
}
