import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatAssetDateTime } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { mapProblemError } from "@/lib/problems/problem-view";
import { problemQueryKeys, type ProblemDetail, type ProblemOptions } from "@/services/problems-api";
import {
  acceptProblemHandoff,
  cancelProblemHandoff,
  rejectProblemHandoff,
  requestProblemHandoff,
} from "@/services/problem-handoffs-api";

/**
 * W7.28 (BA-problems-10): a problem changes group only through this recorded
 * handoff. While it waits, the problem stays where it is: the target group
 * accepts or rejects it, the requesting side may call it off, and nothing moves
 * behind the scenes. A problem manager can also start the handoff here, without
 * touching the rest of the problem.
 */
export function ProblemHandoffPanel({
  problem,
  options,
  onChanged,
}: {
  readonly problem: ProblemDetail;
  readonly options?: ProblemOptions;
  readonly onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handoff = problem.handoff;
  const canRequest = handoff === null && problem.permissions.canHandoff && options !== undefined;
  if (handoff === null && !canRequest) return null;

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
        actions={
          handoff === null ? undefined : (
            <Badge tone="warning">{t("problems.handoff.pendingTitle")}</Badge>
          )
        }
      />
      {handoff === null ? (
        <RequestHandoff
          problem={problem}
          groups={options?.groups ?? []}
          busy={busy}
          error={error}
          onRequest={(toGroupId, reason) =>
            run(
              "request",
              () => requestProblemHandoff(problem.id, { toGroupId, reason }),
              (result) =>
                result.handoff.status === "ACCEPTED"
                  ? t("problems.handoff.acceptedToast", { group: result.handoff.toGroup.name })
                  : t("problems.handoff.pendingToast", { group: result.handoff.toGroup.name }),
            )
          }
        />
      ) : (
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
      )}
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

function RequestHandoff({
  problem,
  groups,
  busy,
  error,
  onRequest,
}: {
  readonly problem: ProblemDetail;
  readonly groups: readonly { readonly id: string; readonly name: string }[];
  readonly busy: string | null;
  readonly error: string | null;
  readonly onRequest: (toGroupId: string, reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [toGroupId, setToGroupId] = useState("");
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState(false);
  const targets = groups.filter((group) => group.id !== problem.group?.id);
  const ready = toGroupId !== "" && reason.trim().length >= 5;

  const submit = async () => {
    setInvalid(false);
    if (!ready) {
      setInvalid(true);
      return;
    }
    try {
      await onRequest(toGroupId, reason.trim());
    } catch {
      // The parent already reported the failure inline and as a toast.
    }
  };

  return (
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
      <Field label={t("problems.handoff.reason")} hint={t("problems.handoff.reasonHint")} required>
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
          disabled={busy !== null}
          data-testid="problem-handoff-request"
          onClick={() => void submit()}
        >
          {t("problems.handoff.request")}
        </Button>
      </div>
    </div>
  );
}
