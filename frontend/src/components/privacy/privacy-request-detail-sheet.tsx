import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hintClassName } from "@/components/ui/control";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { deadlineTone, localizePersonName } from "@/lib/privacy/privacy-view";
import {
  closeDataSubjectRequest,
  extendDataSubjectRequest,
  updateDataSubjectRequest,
  type DataSubjectRequest,
  type DataSubjectRequestChannel,
  type DataSubjectRequestStatus,
  type DataSubjectRequestType,
} from "@/services/privacy-api";
import { useDateFormat, usePrivacyFailure } from "./privacy-shared";

export const requestTypeKey = (type: DataSubjectRequestType) =>
  `privacy.requests.type.${type}` as "privacy.requests.type.ACCESS";
export const channelKey = (channel: DataSubjectRequestChannel) =>
  `privacy.requests.channel.${channel}` as "privacy.requests.channel.EMAIL";
const statusKey = (status: DataSubjectRequestStatus) =>
  `privacy.requests.status.${status}` as "privacy.requests.status.RECEIVED";

export function DeadlineBadge({ request }: { readonly request: DataSubjectRequest }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  if (request.daysLeft === null) {
    return <span className="text-muted-foreground">{format.date(request.closedAt)}</span>;
  }
  const label =
    request.daysLeft < 0
      ? t("privacy.requests.overdue", { count: -request.daysLeft })
      : t("privacy.requests.daysLeft", { count: request.daysLeft });
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span data-testid="privacy-request-deadline" data-tone={deadlineTone(request.daysLeft)}>
        <Badge tone={deadlineTone(request.daysLeft)} dot>
          {label}
        </Badge>
      </span>
      <span className={hintClassName}>{format.date(request.effectiveDueAt)}</span>
    </span>
  );
}

export function RequestDetailSheet({
  request,
  canManage,
  canAnonymize,
  onClose,
  onChanged,
  onFollowUp,
}: {
  readonly request: DataSubjectRequest | null;
  readonly canManage: boolean;
  readonly canAnonymize: boolean;
  readonly onClose: () => void;
  readonly onChanged: (request: DataSubjectRequest) => void;
  readonly onFollowUp: (tab: "exports" | "anonymization", request: DataSubjectRequest) => void;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const format = useDateFormat();
  const fail = usePrivacyFailure();
  const [mode, setMode] = useState<"view" | "extend" | "close">("view");
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<"COMPLETED" | "REJECTED">("COMPLETED");
  const [resultRef, setResultRef] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode("view");
    setReason("");
    setOutcome("COMPLETED");
    setResultRef("");
  }, [request?.id]);

  if (request === null) {
    return <Sheet open={false} onOpenChange={() => undefined} />;
  }
  const isOpen = request.closedAt === null;
  const run = async (action: () => Promise<DataSubjectRequest>, done: string) => {
    setBusy(true);
    try {
      onChanged(await action());
      setMode("view");
      setReason("");
      toast({ title: done, tone: "success" });
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };
  const person = (value: { displayName: string } | null) =>
    value === null ? "—" : localizePersonName(value.displayName, i18n.language);
  const rows: readonly [string, string][] = [
    [t("privacy.requests.columns.type"), t(requestTypeKey(request.type))],
    [t("privacy.requests.columns.status"), t(statusKey(request.status))],
    [t("privacy.requests.form.channel"), t(channelKey(request.channel))],
    [t("privacy.requests.form.subjectLabel"), request.subjectLabel],
    [t("privacy.requests.form.subjectUser"), person(request.subjectUser)],
    [t("privacy.requests.columns.handler"), person(request.handlerUser)],
    [t("privacy.requests.columns.received"), format.date(request.receivedAt)],
    [t("privacy.requests.detail.dueAt"), format.date(request.dueAt)],
    ...(request.extendedDueAt !== null
      ? ([[t("privacy.requests.detail.extendedDueAt"), format.date(request.extendedDueAt)]] as [
          string,
          string,
        ][])
      : []),
    ...(request.extensionReason !== null
      ? ([[t("privacy.requests.detail.extensionReason"), request.extensionReason]] as [
          string,
          string,
        ][])
      : []),
    ...(request.rejectionReason !== null
      ? ([[t("privacy.requests.detail.rejectionReason"), request.rejectionReason]] as [
          string,
          string,
        ][])
      : []),
    ...(request.resultRef !== null
      ? ([[t("privacy.requests.detail.resultRef"), request.resultRef]] as [string, string][])
      : []),
    ...(request.closedAt !== null
      ? ([[t("privacy.requests.detail.closedAt"), format.date(request.closedAt)]] as [
          string,
          string,
        ][])
      : []),
  ];
  const canExport =
    canManage &&
    isOpen &&
    request.subjectUser !== null &&
    (request.type === "ACCESS" || request.type === "PORTABILITY");
  const canErase =
    canAnonymize && isOpen && request.subjectUser !== null && request.type === "ERASURE";
  const rejectionValid = outcome !== "REJECTED" || reason.trim().length >= 10;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="flex w-full max-w-md flex-col overflow-y-auto p-0"
        data-testid="privacy-request-detail"
      >
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle className="text-[15px] font-semibold text-foreground">
            {t(requestTypeKey(request.type))} · {request.subjectLabel}
          </SheetTitle>
          <SheetDescription className="mt-2">
            <DeadlineBadge request={request} />
          </SheetDescription>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4">
          <dl className="grid grid-cols-[minmax(0,40%)_1fr] gap-x-3 gap-y-2 text-[12.5px]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-wrap break-words text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          {request.notes !== null ? (
            <div>
              <p className="mb-1 text-[12px] font-medium text-foreground">
                {t("privacy.requests.form.notes")}
              </p>
              <p className="whitespace-pre-wrap rounded-md border border-border/70 bg-elevated px-3 py-2 text-[12.5px]">
                {request.notes}
              </p>
            </div>
          ) : null}

          {canManage && isOpen && mode === "view" ? (
            <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
              {request.status === "RECEIVED" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => updateDataSubjectRequest(request.id, { status: "IN_PROGRESS" }),
                      t("privacy.requests.detail.startedToast"),
                    )
                  }
                >
                  {t("privacy.requests.detail.start")}
                </Button>
              ) : null}
              {canExport ? (
                <Button size="sm" variant="outline" onClick={() => onFollowUp("exports", request)}>
                  {t("privacy.requests.detail.toExport")}
                </Button>
              ) : null}
              {canErase ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onFollowUp("anonymization", request)}
                >
                  {t("privacy.requests.detail.toAnonymization")}
                </Button>
              ) : null}
              {request.canExtend ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMode("extend")}
                  data-testid="privacy-request-extend"
                >
                  {t("privacy.requests.detail.extend")}
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={() => setMode("close")}
                data-testid="privacy-request-close"
              >
                {t("privacy.requests.detail.close")}
              </Button>
            </div>
          ) : null}

          {mode === "extend" ? (
            <div className="flex flex-col gap-3 border-t border-border/70 pt-4">
              <p className={hintClassName}>{t("privacy.requests.detail.extendHint")}</p>
              <Field
                label={t("privacy.requests.detail.extensionReason")}
                hint={t("privacy.common.minChars", { count: 10 })}
                required
              >
                {(control) => (
                  <Textarea
                    {...control}
                    value={reason}
                    maxLength={1000}
                    onChange={(event) => setReason(event.target.value)}
                  />
                )}
              </Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setMode("view")}>
                  {t("ui.cancel")}
                </Button>
                <Button
                  size="sm"
                  disabled={busy || reason.trim().length < 10}
                  onClick={() =>
                    void run(
                      () => extendDataSubjectRequest(request.id, reason.trim()),
                      t("privacy.requests.detail.extendedToast"),
                    )
                  }
                >
                  {t("privacy.requests.detail.extend")}
                </Button>
              </div>
            </div>
          ) : null}

          {mode === "close" ? (
            <div className="flex flex-col gap-3 border-t border-border/70 pt-4">
              <Segmented
                size="sm"
                label={t("privacy.requests.detail.outcome")}
                value={outcome}
                onChange={setOutcome}
                items={[
                  { value: "COMPLETED", label: t("privacy.requests.status.COMPLETED") },
                  { value: "REJECTED", label: t("privacy.requests.status.REJECTED") },
                ]}
              />
              {outcome === "REJECTED" ? (
                <Field
                  label={t("privacy.requests.detail.rejectionReason")}
                  hint={t("privacy.requests.detail.rejectionHint")}
                  required
                >
                  {(control) => (
                    <Textarea
                      {...control}
                      value={reason}
                      maxLength={1000}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  )}
                </Field>
              ) : null}
              <Field
                label={t("privacy.requests.detail.resultRef")}
                hint={t("privacy.requests.detail.resultRefHint")}
              >
                {(control) => (
                  <Input
                    {...control}
                    value={resultRef}
                    maxLength={300}
                    onChange={(event) => setResultRef(event.target.value)}
                  />
                )}
              </Field>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setMode("view")}>
                  {t("ui.cancel")}
                </Button>
                <Button
                  size="sm"
                  disabled={busy || !rejectionValid}
                  data-testid="privacy-request-close-confirm"
                  onClick={() =>
                    void run(
                      () =>
                        closeDataSubjectRequest(request.id, {
                          outcome,
                          ...(outcome === "REJECTED" ? { rejectionReason: reason.trim() } : {}),
                          ...(resultRef.trim().length > 0 ? { resultRef: resultRef.trim() } : {}),
                        }),
                      t("privacy.requests.detail.closedToast"),
                    )
                  }
                >
                  {t("privacy.requests.detail.close")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
