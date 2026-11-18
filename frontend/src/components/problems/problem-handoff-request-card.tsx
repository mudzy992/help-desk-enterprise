import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError } from "@/lib/problems/problem-view";
import { problemQueryKeys, type ProblemDetail } from "@/services/problems-api";
import { requestProblemHandoff } from "@/services/problem-handoffs-api";

/**
 * W7.28 (BA-problems-10) / W7.36: asking for a handoff is an action on the
 * record, not a permanent banner. The form therefore lives inside the
 * "Pregled" tab, collapsed to one line, and only an actual pending handoff
 * keeps a card at the top of the page (see `ProblemHandoffPanel`).
 */
export function ProblemHandoffRequestCard({
  problem,
  groups,
  onChanged,
}: {
  readonly problem: ProblemDetail;
  readonly groups: readonly { readonly id: string; readonly name: string }[];
  readonly onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toGroupId, setToGroupId] = useState("");
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);

  // A pending handoff is decided in the card at the top of the page, and a
  // problem that cannot be handed off has no form at all.
  if (!problem.permissions.canHandoff || problem.handoff !== null) return null;

  const targets = groups.filter((group) => group.id !== problem.group?.id);
  const ready = toGroupId !== "" && reason.trim().length >= 5;

  const submit = async () => {
    setInvalid(false);
    if (!ready) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await requestProblemHandoff(problem.id, {
        toGroupId,
        reason: reason.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: problemQueryKeys.detail(problem.id) });
      await queryClient.invalidateQueries({ queryKey: problemQueryKeys.events(problem.id) });
      onChanged();
      toast({
        tone: "success",
        title:
          result.handoff.status === "ACCEPTED"
            ? t("problems.handoff.acceptedToast", { group: result.handoff.toGroup.name })
            : t("problems.handoff.pendingToast", { group: result.handoff.toGroup.name }),
      });
      setOpen(false);
      setToGroupId("");
      setReason("");
    } catch (caught) {
      const message = t(mapProblemError(caught) ?? mapApiError(caught));
      setError(message);
      toast({ tone: "danger", title: message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-0" data-testid="problem-handoff-request">
      <CardHeader
        title={t("problems.handoff.requestCardTitle")}
        actions={
          <Button
            variant="outline"
            size="sm"
            aria-expanded={open}
            data-testid="problem-handoff-request-toggle"
            onClick={() => setOpen((current) => !current)}
          >
            {t("problems.handoff.request")}
          </Button>
        }
      />
      {open ? (
        <div className="grid gap-3 px-4 pb-4">
          <p className={hintClassName}>{t("problems.handoff.requestHint")}</p>
          <Field label={t("problems.handoff.targetGroup")} required>
            {(control) => (
              <Select
                {...control}
                value={toGroupId}
                onChange={(event) => setToGroupId(event.target.value)}
              >
                <option value="">{t("problems.form.groupPlaceholder")}</option>
                {targets.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label={t("problems.handoff.reason")}
            hint={t("problems.handoff.reasonHint")}
            required
          >
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                maxLength={2000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
          {invalid ? <p className={errorTextClassName}>{t("problems.errors.validation")}</p> : null}
          {error !== null ? (
            <p role="alert" data-testid="problem-handoff-error" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <div>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              data-testid="problem-handoff-submit"
              onClick={() => void submit()}
            >
              {t("problems.handoff.submit")}
            </Button>
          </div>
        </div>
      ) : (
        <p className={`px-4 pb-4 ${hintClassName}`}>{t("problems.handoff.requestCardCollapsed")}</p>
      )}
    </Card>
  );
}
