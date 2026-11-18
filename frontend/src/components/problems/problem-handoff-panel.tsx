import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError } from "@/lib/problems/problem-view";
import { problemQueryKeys, type ProblemDetail } from "@/services/problems-api";
import {
  acceptProblemHandoff,
  cancelProblemHandoff,
  rejectProblemHandoff,
} from "@/services/problem-handoffs-api";

/**
 * W7.28 (BA-problems-10) / W7.36: a problem changes group only through a recorded
 * handoff. While it waits, the problem stays where it is: the target group
 * accepts or rejects it, the requesting side may call it off, and nothing moves
 * behind the scenes.
 *
 * This card renders **only** while a decision is pending — that is state somebody
 * has to act on, so it belongs at the top of the record. Starting a handoff is an
 * action, and its form lives inside the "Pregled" tab
 * (`ProblemHandoffRequestCard`).
 */
export function ProblemHandoffPanel({
  problem,
  onChanged,
}: {
  readonly problem: ProblemDetail;
  readonly onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handoff = problem.handoff;
  if (handoff === null) return null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: problemQueryKeys.detail(problem.id) });
    await queryClient.invalidateQueries({ queryKey: problemQueryKeys.events(problem.id) });
    onChanged();
  };

  const run = async <T,>(
    action: string,
    operation: () => Promise<T>,
    title: (result: T) => string,
  ) => {
    setBusy(action);
    setError(null);
    try {
      const result = await operation();
      await refresh();
      toast({ tone: "success", title: title(result) });
    } catch (caught) {
      const message = t(mapProblemError(caught) ?? mapApiError(caught));
      // A decision carries a reason field: keep it inline and repeat the toast.
      setError(message);
      toast({ tone: "danger", title: message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-0" data-testid="problem-handoff-panel">
      <CardHeader
        title={t("problems.handoff.title")}
        actions={<Badge tone="warning">{t("problems.handoff.pendingTitle")}</Badge>}
      />
      <PendingHandoff
        problem={problem}
        busy={busy}
        error={error}
        onDecision={(action, operation) =>
          run(action, operation, () =>
            action === "accept"
              ? t("problems.handoff.acceptedToast", { group: handoff.toGroup.name })
              : t("problems.handoff.decidedToast"),
          )
        }
      />
    </Card>
  );
}

function PendingHandoff({
  problem,
  busy,
  error,
  onDecision,
}: {
  readonly problem: ProblemDetail;
  readonly busy: string | null;
  readonly error: string | null;
  readonly onDecision: (
    action: "accept" | "reject" | "cancel",
    operation: () => Promise<unknown>,
  ) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [rejecting, setRejecting] = useState(false);
  const [decisionReason, setDecisionReason] = useState("");
  const handoff = problem.handoff;
  if (handoff === null) return null;
  const reasonTooShort = decisionReason.trim().length < 5;
  const requestedAt =
    handoff.createdAt === "" ? "—" : formatAssetDateTime(handoff.createdAt, i18n.language);
  const canDecide = problem.permissions.canDecideHandoff;
  const canCancel = problem.permissions.canCancelHandoff;
  if (!canDecide && !canCancel)
    return (
      <p className="px-4 pb-4 text-[12.5px] text-muted-foreground">
        {t("problems.handoff.pendingHint")}
      </p>
    );

  return (
    <div className="grid gap-3 px-4 pb-4">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <ArrowRightLeft size={14} aria-hidden="true" className="text-muted-foreground" />
        <span className="font-medium">{problem.group?.name ?? "—"}</span>
        <span aria-hidden="true">→</span>
        <span className="font-medium">{handoff.toGroup.name}</span>
        <span className="text-muted-foreground">· {handoff.toOrganizationalUnit.name}</span>
      </div>
      <dl className="grid gap-1 text-[12.5px] sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t("problems.handoff.requestedBy")}</dt>
          <dd>{handoff.requestedBy?.displayName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("problems.handoff.requestedAt")}</dt>
          <dd>{requestedAt}</dd>
        </div>
      </dl>
      <div className="rounded-md border border-border px-3 py-2 text-[12.5px]">
        <span className="block text-muted-foreground">{t("problems.handoff.reason")}</span>
        <span className="whitespace-pre-line text-foreground">{handoff.reason}</span>
      </div>
      <p className={hintClassName}>{t("problems.handoff.pendingHint")}</p>
      {rejecting ? (
        <Field label={t("problems.handoff.decisionReason")} hint={t("problems.handoff.rejectHint")}>
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={2000}
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
            />
          )}
        </Field>
      ) : null}
      {error !== null ? (
        <p role="alert" data-testid="problem-handoff-error" className={errorTextClassName}>
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canDecide ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={busy !== null}
              data-testid="problem-handoff-accept"
              onClick={() =>
                void onDecision("accept", () => acceptProblemHandoff(problem.id, handoff.id))
              }
            >
              {t("problems.handoff.accept")}
            </Button>
            {rejecting ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy !== null || reasonTooShort}
                data-testid="problem-handoff-reject-confirm"
                onClick={() =>
                  void onDecision("reject", () =>
                    rejectProblemHandoff(problem.id, handoff.id, { reason: decisionReason.trim() }),
                  )
                }
              >
                {t("problems.handoff.reject")}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => setRejecting(true)}
              >
                {t("problems.handoff.reject")}
              </Button>
            )}
          </>
        ) : null}
        {canCancel ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            data-testid="problem-handoff-cancel"
            onClick={() =>
              void onDecision("cancel", () => cancelProblemHandoff(problem.id, handoff.id))
            }
          >
            {t("problems.handoff.cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
