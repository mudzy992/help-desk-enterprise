import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChangeConflictsList } from "@/components/changes/change-conflicts-list";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Select, Textarea } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  actionChecksConflicts,
  actionNeedsReason,
  changeActionKeys,
  changeOutcomeKeys,
  changeReasonMin,
  changeStatusKeys,
  isDestructiveAction,
  mapChangeError,
  reviewNotesMin,
} from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  actOnChange,
  changeOutcomes,
  changeQueryKeys,
  getChangeConflicts,
  type ChangeAction,
  type ChangeDetail,
  type ChangeOutcome,
} from "@/services/changes-api";

interface ChangeActionSheetProperties {
  readonly action: ChangeAction | null;
  readonly change: ChangeDetail;
  readonly onClose: () => void;
  readonly onDone: (next: ChangeDetail) => void;
}

/**
 * Paket 3.4 (§6, §9, §12): one lifecycle step with every field it needs:
 * a reason (return, withdraw, cancel), the outcome (finish), review notes
 * (close) and the conflict acknowledgement where the window is committed.
 */
export function ChangeActionSheet({ action, change, onClose, onDone }: ChangeActionSheetProperties) {
  const { t } = useTranslation();
  const open = action !== null;
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<ChangeOutcome | "">("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setOutcome("");
    setReviewNotes(change.reviewNotes ?? "");
    setAcknowledged(false);
    setError(null);
  }, [open, change.reviewNotes]);

  const checksConflicts = action !== null && actionChecksConflicts(action, change.type) && change.plannedStart !== null && change.plannedEnd !== null;
  const conflictsQuery = useQuery({
    queryKey: [...changeQueryKeys.conflicts(change.id), change.version],
    queryFn: () => getChangeConflicts(change.id),
    enabled: open && checksConflicts,
    retry: false,
  });
  const conflicts = conflictsQuery.data;
  const needsAcknowledge = conflicts !== undefined && conflicts.hasWarnings && !conflicts.acknowledgedAt;
  const blocked = conflicts?.freezeBlocks === true;

  const needsReason = action !== null && actionNeedsReason(action);
  const notesMin = reviewNotesMin(change.outcome);
  const canSubmit =
    action !== null &&
    !pending &&
    !blocked &&
    !(checksConflicts && conflictsQuery.isLoading) &&
    (!needsAcknowledge || acknowledged) &&
    (!needsReason || reason.trim().length >= changeReasonMin) &&
    (action !== "finish" || outcome !== "") &&
    (action !== "close" || reviewNotes.trim().length >= notesMin);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (action === null || !canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const next = await actOnChange(change.id, {
        version: change.version,
        action,
        ...(needsReason ? { reason: reason.trim() } : {}),
        ...(action === "finish" && outcome !== "" ? { outcome } : {}),
        ...(action === "close" || (action === "finish" && reviewNotes.trim() !== "") ? { reviewNotes: reviewNotes.trim() } : {}),
        ...(needsAcknowledge ? { acknowledgeConflicts: true } : {}),
      });
      onDone(next);
      onClose();
    } catch (caught) {
      setError(t(mapChangeError(caught) ?? mapApiError(caught)));
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (pending || next ? undefined : onClose())}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5" data-testid="change-action-sheet">
        <SheetTitle>{action !== null ? t(changeActionKeys[action]) : ""}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("changes.actionSheet.current", { status: t(changeStatusKeys[change.status]) })}
        </SheetDescription>
        {action !== null ? (
          <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
            <p className={hintClassName}>{t(`changes.actionSheet.hint.${action}`)}</p>
            {checksConflicts ? (
              conflictsQuery.isLoading ? (
                <PanelSkeleton label={t("ui.loading")} />
              ) : conflicts !== undefined ? (
                <div className="grid gap-2">
                  <p className="text-[12.5px] font-medium text-foreground">{t("changes.conflicts.title")}</p>
                  <ChangeConflictsList conflicts={conflicts} />
                  {needsAcknowledge ? (
                    <Checkbox
                      label={t("changes.conflicts.acknowledge")}
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                      data-testid="change-acknowledge-conflicts"
                    />
                  ) : null}
                </div>
              ) : null
            ) : null}
            {needsReason ? (
              <Field label={t("changes.actionSheet.reason")} required hint={t("changes.actionSheet.reasonHint", { min: changeReasonMin })}>
                {(control) => <Textarea {...control} rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />}
              </Field>
            ) : null}
            {action === "finish" ? (
              <Field label={t("changes.fields.outcome")} required>
                {(control) => (
                  <Select {...control} value={outcome} onChange={(event) => setOutcome(event.target.value as ChangeOutcome | "")} data-testid="change-outcome">
                    <option value="">{t("changes.actionSheet.outcomePlaceholder")}</option>
                    {changeOutcomes.map((value) => (
                      <option key={value} value={value}>
                        {t(changeOutcomeKeys[value])}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
            {action === "finish" || action === "close" ? (
              <Field
                label={t("changes.fields.reviewNotes")}
                required={action === "close"}
                hint={action === "close" ? t("changes.actionSheet.reviewHint", { min: notesMin }) : t("changes.actionSheet.reviewLaterHint")}
              >
                {(control) => (
                  <Textarea {...control} rows={5} maxLength={8000} value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} data-testid="change-review-notes" />
                )}
              </Field>
            ) : null}
            {error !== null ? (
              <p role="alert" className={errorTextClassName}>
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                {t("ui.cancel")}
              </Button>
              <Button type="submit" variant={isDestructiveAction(action) ? "danger" : "primary"} disabled={!canSubmit} data-testid="change-action-submit">
                {pending ? t("ui.loading") : t(changeActionKeys[action])}
              </Button>
            </div>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
