import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hintClassName } from "@/components/ui/control";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useReportScheduleRuns } from "@/lib/reports/use-report-schedule-runs";
import type { ReportSchedule, ReportScheduleRunStatus } from "@/services/report-schedules-api";

export const statusTones: Record<ReportScheduleRunStatus, BadgeTone> = {
  RUNNING: "info",
  SENT: "success",
  PARTIAL: "warning",
  FAILED: "danger",
  SKIPPED: "neutral",
};
export const statusKeys = {
  RUNNING: "reports.schedules.status.RUNNING",
  SENT: "reports.schedules.status.SENT",
  PARTIAL: "reports.schedules.status.PARTIAL",
  FAILED: "reports.schedules.status.FAILED",
  SKIPPED: "reports.schedules.status.SKIPPED",
} as const;

const skipReasonKeys = {
  inactive: "reports.schedules.skip.inactive",
  no_access: "reports.schedules.skip.no_access",
  email_not_allowed: "reports.schedules.skip.email_not_allowed",
  delivery_failed: "reports.schedules.skip.delivery_failed",
} as const;

const omitReasonKeys = {
  too_many_rows: "reports.schedules.omit.too_many_rows",
  too_large: "reports.schedules.omit.too_large",
  pack_disabled: "reports.schedules.omit.pack_disabled",
  failed: "reports.schedules.omit.failed",
} as const;

const runErrorKeys = {
  missed: "reports.schedules.runError.missed",
  email_disabled: "reports.schedules.runError.email_disabled",
  scheduled_disabled: "reports.schedules.runError.scheduled_disabled",
  reports_disabled: "reports.schedules.runError.reports_disabled",
  no_recipients: "reports.schedules.runError.no_recipients",
  build_failed: "reports.schedules.runError.build_failed",
} as const;

/** Stored codes come from the backend; an unknown one is shown as is. */
function keyOf<T extends Record<string, string>>(map: T, code: string): T[keyof T] | null {
  return Object.prototype.hasOwnProperty.call(map, code) ? map[code as keyof T] : null;
}

export function ReportScheduleRunsSheet({
  schedule,
  timeZone,
  onClose,
}: {
  readonly schedule: ReportSchedule | null;
  readonly timeZone: string;
  readonly onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { runs, error, isLoading, load } = useReportScheduleRuns(schedule?.id ?? null);

  const describe = <T extends Record<string, string>>(map: T, code: string): string => {
    const key = keyOf(map, code);
    return key === null ? code : t(key as unknown as "reports.schedules.skip.inactive");
  };
  const date = (value: string) =>
    new Date(value).toLocaleDateString(i18n.language, {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  return (
    <Sheet open={schedule !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full max-w-md flex-col p-0" data-testid="schedule-runs-sheet">
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle className="text-[15px] font-semibold text-foreground">
            {t("reports.schedules.historyTitle")}
          </SheetTitle>
          <SheetDescription className={hintClassName}>{schedule?.name}</SheetDescription>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error !== null ? (
            <div className="grid gap-2">
              <ApiErrorText messageKey={error.key} requestId={error.requestId} />
              <Button size="sm" variant="outline" disabled={isLoading} onClick={() => void load()}>
                <RefreshCw size={14} /> {isLoading ? t("ui.loading") : t("ui.retry")}
              </Button>
            </div>
          ) : runs === null ? (
            <PanelSkeleton className="mt-0" label={t("reports.schedules.historyTitle")} />
          ) : runs.length === 0 ? (
            <p className={hintClassName}>{t("reports.schedules.historyEmpty")}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {runs.map((run) => (
                <li key={run.id} className="rounded-md border border-border/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={statusTones[run.status]} dot>
                      {t(statusKeys[run.status])}
                    </Badge>
                    <span className="text-[11.5px] text-muted-foreground">
                      {new Date(run.createdAt).toLocaleString(i18n.language, { timeZone })}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-foreground">
                    {t("reports.schedules.runPeriod", {
                      from: date(run.periodStart),
                      to: date(new Date(new Date(run.periodEnd).getTime() - 1).toISOString()),
                    })}
                  </p>
                  <p className={hintClassName}>
                    {t("reports.schedules.runCounts", {
                      sent: run.sentCount,
                      total: run.recipientCount,
                    })}
                    {run.trigger === "MANUAL"
                      ? ` · ${t("reports.schedules.manual", { name: run.triggeredBy?.displayName ?? "—" })}`
                      : ""}
                  </p>
                  {run.errorCode !== null ? (
                    <p className="mt-1 text-[12px] text-danger">
                      {describe(runErrorKeys, run.errorCode)}
                    </p>
                  ) : null}
                  {run.skipped.length > 0 ? (
                    <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-muted-foreground">
                      {run.skipped.map((item) => (
                        <li key={`${item.userId}-${item.reason}`}>
                          {item.displayName ?? item.userId}: {describe(skipReasonKeys, item.reason)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {run.omittedAttachments.length > 0 ? (
                    <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px] text-muted-foreground">
                      {run.omittedAttachments.map((item) => (
                        <li key={`${item.pack}-${item.reason}`}>
                          {t(
                            `reports.packs.names.${item.pack}` as "reports.packs.names.monthly_kpi",
                            {
                              defaultValue: item.pack,
                            },
                          )}
                          : {describe(omitReasonKeys, item.reason)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
