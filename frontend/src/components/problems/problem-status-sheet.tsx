import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ticketText } from "@/lib/tickets/ticket-text";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError, problemReasonMin, problemStatusKeys, transitionLabelKey, transitionNeedsReason } from "@/lib/problems/problem-view";
import {
  isResolveTicketsValid,
  ProblemResolveTicketsSection,
  type ProblemResolveTicketsValue,
} from "@/components/problems/problem-resolve-tickets-section";
import {
  changeProblemStatus,
  getProblemResolvePreview,
  problemDetailKeys,
  type ProblemDetail,
  type ProblemStatus,
  type ProblemTicketResolveOutcome,
} from "@/services/problems-api";

interface ProblemStatusSheetProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly problem: ProblemDetail;
  readonly initialStatus?: ProblemStatus;
  readonly onDone: () => void;
}

/**
 * Paket 3.3 (§5, §8.4): status change with the reason where the rules ask for
 * one; RESOLVED optionally resolves the open linked tickets (P4).
 */
export function ProblemStatusSheet({ open, onOpenChange, problem, initialStatus, onDone }: ProblemStatusSheetProperties) {
  const { t } = useTranslation();
  const targets = problem.allowedTransitions;
  const [status, setStatus] = useState<ProblemStatus | "">("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultMessage = t("problems.resolveTickets.defaultMessage", { number: problem.number });
  const [resolveTickets, setResolveTickets] = useState<ProblemResolveTicketsValue>({ enabled: false, message: defaultMessage, closeCode: "" });
  const [outcome, setOutcome] = useState<ProblemTicketResolveOutcome | null>(null);

  useEffect(() => {
    if (!open) return;
    setStatus(initialStatus ?? targets[0] ?? "");
    setReason("");
    setError(null);
    setOutcome(null);
    setResolveTickets({ enabled: false, message: defaultMessage, closeCode: "" });
    // The default message only matters when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStatus, targets]);

  const offersGroupResolve = status === "RESOLVED" && problem.permissions.canClose;
  const groupResolve = offersGroupResolve && resolveTickets.enabled;
  // Same key as the section below, so the preview is fetched once.
  const preview = useQuery({
    queryKey: problemDetailKeys.resolvePreview(problem.id),
    queryFn: () => getProblemResolvePreview(problem.id),
    retry: false,
    enabled: open && offersGroupResolve,
  }).data;
  const needsReason = status !== "" && transitionNeedsReason(problem.status, status);
  const canSubmit =
    !pending &&
    status !== "" &&
    (!needsReason || reason.trim().length >= problemReasonMin) &&
    (!groupResolve || isResolveTicketsValid(resolveTickets, preview));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === "" || !canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const result = await changeProblemStatus(problem.id, {
        version: problem.version,
        status,
        reason: reason.trim() || undefined,
        ...(groupResolve
          ? { resolveTickets: true, message: resolveTickets.message.trim(), closeCode: resolveTickets.closeCode || undefined }
          : {}),
      });
      onDone();
      if (result.ticketResolution !== null) {
        // Keep the sheet open with the per-ticket outcome.
        setOutcome(result.ticketResolution);
        return;
      }
      onOpenChange(false);
    } catch (caught) {
      setError(t(mapProblemError(caught) ?? mapApiError(caught)));
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5" data-testid="problem-status-sheet">
        <SheetTitle>{t("problems.statusSheet.title")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("problems.statusSheet.current", { status: t(problemStatusKeys[problem.status]) })}
        </SheetDescription>
        {outcome !== null ? (
          <ResolveOutcome outcome={outcome} onClose={() => onOpenChange(false)} />
        ) : targets.length === 0 ? (
          <p className={`mt-4 ${hintClassName}`}>{t("problems.statusSheet.final")}</p>
        ) : (
          <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
            <Field label={t("problems.statusSheet.newStatus")} required>
              {(control) => (
                <Select {...control} value={status} onChange={(event) => setStatus(event.target.value as ProblemStatus)}>
                  {targets.map((target) => (
                    <option key={target} value={target}>
                      {ticketText(t, transitionLabelKey(problem.status, target))}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {status !== "" ? <p className={hintClassName}>{ticketText(t, `problems.statusSheet.hint.${status}`)}</p> : null}
            {needsReason ? (
              <Field label={t("problems.statusSheet.reason")} required hint={t("problems.statusSheet.reasonHint", { min: problemReasonMin })}>
                {(control) => <Textarea {...control} rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />}
              </Field>
            ) : null}
            {offersGroupResolve ? (
              <ProblemResolveTicketsSection problemId={problem.id} value={resolveTickets} onChange={setResolveTickets} disabled={pending} />
            ) : null}
            {error !== null ? (
              <p role="alert" className={errorTextClassName}>
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
                {t("ui.cancel")}
              </Button>
              <Button type="submit" variant={status === "CANCELLED" ? "danger" : "primary"} disabled={!canSubmit} data-testid="problem-status-submit">
                {pending ? t("ui.loading") : t("problems.statusSheet.submit")}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ResolveOutcome({ outcome, onClose }: { readonly outcome: ProblemTicketResolveOutcome; readonly onClose: () => void }) {
  const { t } = useTranslation();
  const withoutMessage = outcome.resolved.filter((item) => !item.messageSent);
  return (
    <div className="mt-4 grid gap-3" data-testid="problem-resolve-outcome">
      <div role="status" className="flex items-start gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-[12.5px] text-foreground">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
        <span>
          {t("problems.resolveTickets.outcome", {
            resolved: outcome.resolved.length,
            skipped: outcome.skipped.length,
            failed: outcome.failed.length,
          })}
        </span>
      </div>
      {withoutMessage.length > 0 ? (
        <p className={hintClassName}>
          {t("problems.resolveTickets.withoutMessage", { tickets: withoutMessage.map((item) => item.ticketNumber).join(", ") })}
        </p>
      ) : null}
      {outcome.failed.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-[12.5px] font-medium text-foreground">{t("problems.resolveTickets.failedTitle")}</p>
          <ul className="grid gap-0.5 text-[12px] text-muted-foreground">
            {outcome.failed.map((item) => (
              <li key={item.ticketId}>
                <span className="tnum font-medium text-foreground">{item.ticketNumber}</span> · {item.code}
              </li>
            ))}
          </ul>
          <p className={hintClassName}>{t("problems.resolveTickets.failedHint")}</p>
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" variant="primary" onClick={onClose} data-testid="problem-resolve-outcome-close">
          {t("problems.resolveTickets.close")}
        </Button>
      </div>
    </div>
  );
}
