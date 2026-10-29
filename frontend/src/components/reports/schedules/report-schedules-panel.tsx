import { ReportScheduleRunsSheet, statusKeys, statusTones } from "./report-schedule-runs-sheet";
export { ReportScheduleRunsSheet } from "./report-schedule-runs-sheet";
import {
  CalendarClock,
  History,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  hintClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  reportErrorMessageKeys,
  type TrendsFilterOption,
} from "@/components/reports/trends/report-trends-panel";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { readReportErrorCode } from "@/lib/reports/report-trends-view";
import {
  deleteReportSchedule,
  listReportSchedules,
  runReportScheduleNow,
  sendReportScheduleTest,
  setReportScheduleEnabled,
  type ReportSchedule,
  type ReportScheduleList,
} from "@/services/report-schedules-api";
import { ReportScheduleSheet, type ReportScheduleDraft } from "./report-schedule-sheet";
import { ScrollRegion } from "@/components/ui/scroll-region";

interface ReportSchedulesPanelProperties {
  readonly units: readonly TrendsFilterOption[];
  readonly services: readonly TrendsFilterOption[];
  readonly groups: readonly TrendsFilterOption[] | null;
  /** From „Zakaži ovaj izvještaj” on the Trends tab — opens the form once. */
  readonly draft: ReportScheduleDraft | null;
  readonly onDraftConsumed: () => void;
}

const frequencyKeys = {
  WEEKLY: "reports.schedules.frequency.WEEKLY",
  MONTHLY: "reports.schedules.frequency.MONTHLY",
} as const;

/** Schedule management is available only with the reports schedule permission. */
export function ReportSchedulesPanel({
  units,
  services,
  groups,
  draft,
  onDraftConsumed,
}: ReportSchedulesPanelProperties) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [list, setList] = useState<ReportScheduleList | null>(null);
  const [loadError, setLoadError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(
    null,
  );
  const [editing, setEditing] = useState<ReportSchedule | null>(null);
  const [formDraft, setFormDraft] = useState<ReportScheduleDraft | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ReportSchedule | null>(null);
  const [confirmRun, setConfirmRun] = useState<ReportSchedule | null>(null);
  const [runsFor, setRunsFor] = useState<ReportSchedule | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pendingOperations = useRef(new Map<string, string>());
  const beginOperation = (key: string, scheduleId: string) => {
    if (pendingOperations.current.has(key)) return false;
    pendingOperations.current.set(key, scheduleId);
    setBusy(scheduleId);
    return true;
  };
  const endOperation = (key: string) => {
    pendingOperations.current.delete(key);
    setBusy(pendingOperations.current.values().next().value ?? null);
  };

  const reload = useCallback(async () => {
    try {
      setList(await listReportSchedules());
      setLoadError(null);
    } catch (caught) {
      setLoadError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (draft === null || list === null) return;
    setEditing(null);
    setFormDraft(draft);
    setFormOpen(true);
    onDraftConsumed();
  }, [draft, list, onDraftConsumed]);

  const fail = (caught: unknown) => {
    const code = readReportErrorCode(caught);
    toast({
      title: code === null ? t(mapApiError(caught)) : t(reportErrorMessageKeys[code]),
      tone: "danger",
      error: caught,
    });
  };

  const replace = (schedule: ReportSchedule) =>
    setList((current) =>
      current === null
        ? current
        : {
            ...current,
            schedules: current.schedules.some((item) => item.id === schedule.id)
              ? current.schedules.map((item) => (item.id === schedule.id ? schedule : item))
              : [...current.schedules, schedule].sort((a, b) => a.name.localeCompare(b.name)),
          },
    );

  const toggleEnabled = async (schedule: ReportSchedule, enabled: boolean) => {
    const operationKey = "toggle:" + schedule.id;
    if (!beginOperation(operationKey, schedule.id)) return;
    try {
      replace(await setReportScheduleEnabled(schedule.id, enabled));
    } catch (caught) {
      fail(caught);
    } finally {
      endOperation(operationKey);
    }
  };

  const sendTest = async (schedule: ReportSchedule) => {
    const operationKey = "test:" + schedule.id;
    if (!beginOperation(operationKey, schedule.id)) return;
    try {
      const result = await sendReportScheduleTest(schedule.id);
      toast(
        result.sent
          ? { title: t("reports.schedules.testSent"), tone: "success" }
          : {
              title: t("reports.schedules.testNotSent"),
              description: result.reason,
              tone: "warning",
            },
      );
    } catch (caught) {
      fail(caught);
    } finally {
      endOperation(operationKey);
    }
  };

  const runNow = async (schedule: ReportSchedule) => {
    const operationKey = "run:" + schedule.id;
    if (!beginOperation(operationKey, schedule.id)) return;
    try {
      const result = await runReportScheduleNow(schedule.id);
      toast(
        result.queued
          ? { title: t("reports.schedules.runQueued"), tone: "success" }
          : { title: t("reports.schedules.runNotQueued"), tone: "warning" },
      );
      setConfirmRun(null);
    } catch (caught) {
      fail(caught);
    } finally {
      endOperation(operationKey);
    }
  };

  const remove = async (schedule: ReportSchedule) => {
    const operationKey = "delete:" + schedule.id;
    if (!beginOperation(operationKey, schedule.id)) return;
    try {
      await deleteReportSchedule(schedule.id);
      setList((current) =>
        current === null
          ? current
          : { ...current, schedules: current.schedules.filter((item) => item.id !== schedule.id) },
      );
      setConfirmDelete(null);
    } catch (caught) {
      fail(caught);
    } finally {
      endOperation(operationKey);
    }
  };

  if (loadError !== null) {
    return (
      <div className="grid gap-2">
        <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} />
        <Button size="sm" variant="outline" onClick={() => void reload()}>
          <RefreshCw size={14} /> {t("ui.retry")}
        </Button>
      </div>
    );
  }
  if (list === null) return <PanelSkeleton className="mt-0" label={t("reports.schedules.title")} />;

  const dateTime = (value: string) =>
    new Date(value).toLocaleString(i18n.language, {
      timeZone: list.settings.timeZone,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const atLimit = list.settings.total >= list.settings.maxSchedules;

  return (
    <div data-testid="schedules-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className={hintClassName}>
          {list.settings.enabled
            ? t("reports.schedules.intro", {
                zone: list.settings.timeZone,
                used: list.settings.total,
                max: list.settings.maxSchedules,
              })
            : t("reports.errors.REPORT_SCHEDULE_DISABLED")}
        </p>
        <Button
          size="sm"
          disabled={!list.settings.enabled || atLimit}
          title={atLimit ? t("reports.errors.REPORT_SCHEDULE_LIMIT") : undefined}
          onClick={() => {
            setEditing(null);
            setFormDraft(null);
            setFormOpen(true);
          }}
          data-testid="schedule-create"
        >
          <Plus size={14} /> {t("reports.schedules.create")}
        </Button>
      </div>

      {list.schedules.length === 0 ? (
        <EmptyState
          icon={<CalendarClock size={18} strokeWidth={1.8} />}
          title={t("reports.schedules.emptyTitle")}
          body={t("reports.schedules.emptyBody")}
        />
      ) : (
        <ScrollRegion className={tableWrapClassName}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className={`${tableHeadClassName} border-b border-border/70`}>
                <th className="px-3 py-2 text-left">{t("reports.schedules.columns.name")}</th>
                <th className="px-3 py-2 text-left">{t("reports.schedules.columns.when")}</th>
                <th className="px-3 py-2 text-left">{t("reports.schedules.columns.scope")}</th>
                <th className="px-3 py-2 text-right">
                  {t("reports.schedules.columns.recipients")}
                </th>
                <th className="px-3 py-2 text-left">{t("reports.schedules.columns.lastRun")}</th>
                <th className="px-3 py-2 text-left">{t("reports.schedules.columns.next")}</th>
                <th className="px-3 py-2 text-center">{t("reports.schedules.columns.enabled")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.schedules.map((schedule) => (
                <tr key={schedule.id} className={tableRowClassName} data-testid="schedule-row">
                  <td className="px-3 font-medium text-foreground">{schedule.name}</td>
                  <td className="px-3 text-muted-foreground">
                    {t(frequencyKeys[schedule.frequency])} · {schedule.sendTime}
                  </td>
                  <td className="max-w-[220px] truncate px-3 text-muted-foreground">
                    {[
                      schedule.organizationalUnit.name,
                      schedule.service?.name,
                      schedule.group?.name,
                    ]
                      .filter((part): part is string => part !== undefined && part !== null)
                      .join(" · ")}
                  </td>
                  <td className="tnum px-3 text-right">{schedule.recipients.length}</td>
                  <td className="px-3">
                    {schedule.lastRun === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Badge tone={statusTones[schedule.lastRun.status]} dot>
                        {t(statusKeys[schedule.lastRun.status])}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 text-muted-foreground">
                    {schedule.enabled ? dateTime(schedule.nextRunAt) : "—"}
                  </td>
                  <td className="px-3 text-center">
                    <Switch
                      checked={schedule.enabled}
                      disabled={busy === schedule.id}
                      onCheckedChange={(checked) => void toggleEnabled(schedule, checked)}
                      aria-label={t("reports.schedules.columns.enabled")}
                    />
                  </td>
                  <td className="px-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="xs"
                          variant="ghost"
                          aria-label={t("reports.schedules.actions")}
                          data-testid="schedule-menu"
                        >
                          <MoreHorizontal size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(schedule);
                            setFormDraft(null);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil size={14} /> {t("reports.schedules.edit")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => void sendTest(schedule)}
                          data-testid="schedule-send-test"
                        >
                          <Send size={14} /> {t("reports.schedules.sendTest")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setConfirmRun(schedule)}>
                          <Play size={14} /> {t("reports.schedules.runNow")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setRunsFor(schedule)}
                          data-testid="schedule-history"
                        >
                          <History size={14} /> {t("reports.schedules.history")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setConfirmDelete(schedule)}>
                          <Trash2 size={14} /> {t("reports.schedules.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}

      <ReportScheduleSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        list={list}
        schedule={editing}
        draft={formDraft}
        units={units}
        services={services}
        groups={groups}
        onSaved={(saved) => {
          replace(saved);
          toast({ title: t("reports.schedules.saved"), tone: "success" });
        }}
      />

      <ConfirmDialog
        open={confirmRun !== null}
        onOpenChange={(open) => !open && setConfirmRun(null)}
        title={t("reports.schedules.runNowTitle")}
        description={t("reports.schedules.runNowBody", {
          name: confirmRun?.name ?? "",
          count: confirmRun?.recipients.length ?? 0,
        })}
        confirmLabel={t("reports.schedules.runNow")}
        isPending={confirmRun !== null && busy === confirmRun.id}
        onConfirm={() => confirmRun !== null && void runNow(confirmRun)}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={t("reports.schedules.deleteTitle")}
        description={t("reports.schedules.deleteBody", { name: confirmDelete?.name ?? "" })}
        confirmLabel={t("reports.schedules.delete")}
        intent="danger"
        isPending={confirmDelete !== null && busy === confirmDelete.id}
        onConfirm={() => confirmDelete !== null && void remove(confirmDelete)}
      />
      <ReportScheduleRunsSheet
        schedule={runsFor}
        timeZone={list.settings.timeZone}
        onClose={() => setRunsFor(null)}
      />
    </div>
  );
}
