import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import {
  getLatestProblemResolutionRun,
  problemQueryKeys,
  resumeProblemResolutionRun,
  type ProblemDetail,
  type ProblemResolutionRunItem,
} from "@/services/problems-api";

const unfinishedStatuses = ["PENDING", "RUNNING", "MESSAGE_PENDING", "FAILED"] as const;
const statusLabelKeys: Record<
  ProblemResolutionRunItem["status"],
  `problems.resolveTickets.run.itemStatus.${ProblemResolutionRunItem["status"]}`
> = {
  PENDING: "problems.resolveTickets.run.itemStatus.PENDING",
  RUNNING: "problems.resolveTickets.run.itemStatus.RUNNING",
  RESOLVED: "problems.resolveTickets.run.itemStatus.RESOLVED",
  MESSAGE_PENDING: "problems.resolveTickets.run.itemStatus.MESSAGE_PENDING",
  SKIPPED: "problems.resolveTickets.run.itemStatus.SKIPPED",
  FAILED: "problems.resolveTickets.run.itemStatus.FAILED",
};

/**
 * W7.24 (BA-problems-06): the durable group resolution survives a reload. While
 * the newest run still has tickets or replies to retry, the problem says so and
 * offers Resume — instead of losing the unfinished part silently.
 */
export function ProblemResolutionRunPanel({
  problem,
  onResumed,
}: {
  readonly problem: ProblemDetail;
  readonly onResumed: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = problem.permissions.canClose && (problem.status === "RESOLVED" || problem.status === "CLOSED");
  const latest = useQuery({
    queryKey: problemQueryKeys.resolutionRunLatest(problem.id),
    queryFn: () => getLatestProblemResolutionRun(problem.id),
    retry: false,
    enabled,
  }).data;
  const run = latest?.run ?? null;
  if (run === null || !run.canResume) return null;

  const unfinished = run.items.filter((item) =>
    (unfinishedStatuses as readonly string[]).includes(item.status),
  );
  const shown = unfinished.slice(0, 5);

  const resume = async () => {
    setResuming(true);
    setError(null);
    try {
      await resumeProblemResolutionRun(problem.id, run.id);
      await queryClient.invalidateQueries({ queryKey: problemQueryKeys.resolutionRunLatest(problem.id) });
      toast({ tone: "success", title: t("problems.resolveTickets.run.resumed") });
      onResumed();
    } catch (caught) {
      const message = t(mapApiError(caught));
      setError(message);
      toast({
        tone: "danger",
        title: t("problems.resolveTickets.run.resumeFailed"),
        description: message,
        error: caught,
      });
    } finally {
      setResuming(false);
    }
  };

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-foreground"
      data-testid="problem-resolution-run-panel"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
      <div className="grid gap-2">
        <span className="font-medium">{t("problems.resolveTickets.run.incomplete")}</span>
        <span className="text-muted-foreground">
          {t("problems.resolveTickets.run.summary", {
            resolved: run.resolved,
            total: run.total,
            pending: unfinished.length,
          })}
        </span>
        <div className="grid gap-0.5">
          <span className="text-[12px] font-medium">{t("problems.resolveTickets.run.pendingTitle")}</span>
          <ul className="grid gap-0.5 text-[12px] text-muted-foreground">
            {shown.map((item) => (
              <li key={item.id}>
                <span className="tnum font-medium text-foreground">{item.ticketNumber}</span> ·{" "}
                {t(statusLabelKeys[item.status])}
                {item.errorCode === null ? "" : ` · ${item.errorCode}`}
              </li>
            ))}
            {unfinished.length > shown.length ? (
              <li>{t("problems.resolveTickets.run.more", { count: unfinished.length - shown.length })}</li>
            ) : null}
          </ul>
        </div>
        {error !== null ? (
          <p role="alert" className={errorTextClassName}>
            {error}
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void resume()}
            disabled={resuming}
            data-testid="problem-resolution-run-resume"
          >
            {resuming ? t("problems.resolveTickets.run.resuming") : t("problems.resolveTickets.run.resume")}
          </Button>
        </div>
        {run.failed > 0 ? <p className={hintClassName}>{t("problems.resolveTickets.run.failedHint")}</p> : null}
      </div>
    </div>
  );
}
