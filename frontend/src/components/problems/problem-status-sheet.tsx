import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ticketText } from "@/lib/tickets/ticket-text";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError, problemReasonMin, problemStatusKeys, transitionLabelKey, transitionNeedsReason } from "@/lib/problems/problem-view";
import { changeProblemStatus, type ProblemDetail, type ProblemStatus } from "@/services/problems-api";

interface ProblemStatusSheetProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly problem: ProblemDetail;
  readonly initialStatus?: ProblemStatus;
  readonly onDone: () => void;
}

/** Paket 3.3 (§5): status change with the reason where the rules ask for one. */
export function ProblemStatusSheet({ open, onOpenChange, problem, initialStatus, onDone }: ProblemStatusSheetProperties) {
  const { t } = useTranslation();
  const targets = problem.allowedTransitions;
  const [status, setStatus] = useState<ProblemStatus | "">("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStatus(initialStatus ?? targets[0] ?? "");
    setReason("");
    setError(null);
  }, [open, initialStatus, targets]);

  const needsReason = status !== "" && transitionNeedsReason(problem.status, status);
  const canSubmit = !pending && status !== "" && (!needsReason || reason.trim().length >= problemReasonMin);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === "" || !canSubmit) return;
    setPending(true);
    setError(null);
    try {
      await changeProblemStatus(problem.id, { version: problem.version, status, reason: reason.trim() || undefined });
      onOpenChange(false);
      onDone();
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
        {targets.length === 0 ? (
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
