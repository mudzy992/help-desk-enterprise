import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { useToast } from "@/components/ui/toast";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  getProblemTargetReminders,
  problemQueryKeys,
  retryProblemTargetReminder,
  type ProblemDetail,
  type ProblemTargetReminder,
  type ProblemTargetReminderStatus,
} from "@/services/problems-api";

const stageLabelKeys: Record<
  string,
  | "problems.targetReminders.stage.before"
  | "problems.targetReminders.stage.due"
  | "problems.targetReminders.stage.overdue"
> = {
  before: "problems.targetReminders.stage.before",
  due: "problems.targetReminders.stage.due",
  overdue: "problems.targetReminders.stage.overdue",
};

const statusLabelKeys: Record<
  ProblemTargetReminderStatus,
  `problems.targetReminders.status.${ProblemTargetReminderStatus}`
> = {
  PENDING: "problems.targetReminders.status.PENDING",
  CLAIMED: "problems.targetReminders.status.CLAIMED",
  SENT: "problems.targetReminders.status.SENT",
  NO_RECIPIENT: "problems.targetReminders.status.NO_RECIPIENT",
  FAILED: "problems.targetReminders.status.FAILED",
  DEAD: "problems.targetReminders.status.DEAD",
  CANCELLED: "problems.targetReminders.status.CANCELLED",
};

const statusTones: Record<ProblemTargetReminderStatus, BadgeTone> = {
  PENDING: "neutral",
  CLAIMED: "info",
  SENT: "success",
  NO_RECIPIENT: "warning",
  FAILED: "danger",
  DEAD: "danger",
  CANCELLED: "neutral",
};

/**
 * W7.25 (BA-problems-07): the reminder used to be marked as sent *before* the
 * attempt, so a failed delivery looked exactly like a delivered one. The problem
 * detail now shows the durable rows of the current target: what was delivered,
 * what failed and why, and — for a problem manager — a retry for a FAILED/DEAD
 * reminder instead of waiting for the next sweep.
 */
export function ProblemTargetReminderPanel({
  problem,
  onRetried,
}: {
  readonly problem: ProblemDetail;
  readonly onRetried: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enabled = problem.targetAt !== null;
  const reminders = useQuery({
    queryKey: problemQueryKeys.targetReminders(problem.id),
    queryFn: () => getProblemTargetReminders(problem.id),
    retry: false,
    enabled,
  }).data;

  const targetAt = problem.targetAt === null ? null : new Date(problem.targetAt).getTime();
  const rows = (reminders?.items ?? []).filter(
    (row) => targetAt === null || new Date(row.targetAt).getTime() === targetAt,
  );
  if (rows.length === 0) return null;

  const date = (value: string | null) =>
    value === null ? "—" : formatAssetDateTime(value, i18n.language);
  const stageLabel = (stage: string) => {
    const key = stageLabelKeys[stage];
    return key === undefined ? stage : t(key);
  };
  const retry = async (row: ProblemTargetReminder) => {
    setRetrying(row.id);
    setError(null);
    try {
      await retryProblemTargetReminder(problem.id, row.id);
      await queryClient.invalidateQueries({
        queryKey: problemQueryKeys.targetReminders(problem.id),
      });
      toast({ tone: "success", title: t("problems.targetReminders.retryDone") });
      onRetried();
    } catch (caught) {
      const message = t(mapApiError(caught));
      setError(message);
      toast({
        tone: "danger",
        title: t("problems.targetReminders.retryFailed"),
        description: message,
        error: caught,
      });
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div
      className="rounded-md border border-border/70 bg-surface/60 px-3 py-2 text-[12.5px]"
      data-testid="problem-target-reminder-panel"
    >
      <div className="flex items-center gap-2">
        <BellRing size={16} className="shrink-0 text-info" aria-hidden="true" />
        <span className="font-medium">{t("problems.targetReminders.title")}</span>
      </div>
      <p className={hintClassName}>{t("problems.targetReminders.hint")}</p>
      <ul className="mt-2 grid gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="grid gap-1 rounded-sm border border-border/60 px-2 py-1.5"
            data-testid={`problem-target-reminder-${row.id}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTones[row.status]} dot>
                {t(statusLabelKeys[row.status])}
              </Badge>
              <span className="font-medium">{stageLabel(row.stage)}</span>
              <span className="tnum text-muted-foreground">
                {t("problems.targetReminders.recipients", {
                  delivered: row.deliveredCount,
                  total: row.recipientCount,
                })}
              </span>
              <span className="tnum text-muted-foreground">
                {t("problems.targetReminders.attempts", { count: row.attempts })}
              </span>
            </div>
            {row.status === "FAILED" || row.status === "DEAD" ? (
              <p className="text-[12px] text-danger">
                {row.errorCode === null
                  ? t("problems.targetReminders.failedUnknown")
                  : t("problems.targetReminders.errorCode", { code: row.errorCode })}
                {row.nextAttemptAt === null
                  ? ` · ${t("problems.targetReminders.noRetry")}`
                  : ` · ${t("problems.targetReminders.nextAttempt", { when: date(row.nextAttemptAt) })}`}
              </p>
            ) : null}
            {row.status === "SENT" ? (
              <p className="text-[12px] text-muted-foreground">
                {t("problems.targetReminders.sentAt", { when: date(row.completedAt) })}
              </p>
            ) : null}
            {row.status === "NO_RECIPIENT" ? (
              <p className="text-[12px] text-muted-foreground">
                {t("problems.targetReminders.noRecipientHint")}
              </p>
            ) : null}
            {row.canRetry ? (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void retry(row)}
                  disabled={retrying !== null}
                  data-testid={`problem-target-reminder-retry-${row.id}`}
                >
                  {retrying === row.id
                    ? t("problems.targetReminders.retrying")
                    : t("problems.targetReminders.retry")}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {error !== null ? (
        <p role="alert" className={errorTextClassName}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
