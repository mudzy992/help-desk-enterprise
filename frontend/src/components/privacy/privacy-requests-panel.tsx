import { FileText, Plus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hintClassName, tableHeadClassName, tableRowClassName, tableWrapClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import {
  dateInputToIso,
  deadlineTone,
  localizePersonName,
  todayInputValue,
} from "@/lib/privacy/privacy-view";
import {
  closeDataSubjectRequest,
  createDataSubjectRequest,
  dataSubjectRequestChannels,
  dataSubjectRequestTypes,
  extendDataSubjectRequest,
  listDataSubjectRequests,
  updateDataSubjectRequest,
  type DataSubjectRequest,
  type DataSubjectRequestChannel,
  type DataSubjectRequestScope,
  type DataSubjectRequestStatus,
  type DataSubjectRequestType,
} from "@/services/privacy-api";
import type { UserSummary } from "@/services/users-api";
import { PanelIntro, PersonPicker, useDateFormat, usePrivacyFailure, useUserDirectory } from "./privacy-shared";

const statusTones: Record<DataSubjectRequestStatus, BadgeTone> = {
  RECEIVED: "info",
  IN_PROGRESS: "primary",
  EXTENDED: "warning",
  COMPLETED: "success",
  REJECTED: "neutral",
};

export const requestTypeKey = (type: DataSubjectRequestType) =>
  `privacy.requests.type.${type}` as "privacy.requests.type.ACCESS";
const channelKey = (channel: DataSubjectRequestChannel) =>
  `privacy.requests.channel.${channel}` as "privacy.requests.channel.EMAIL";
const statusKey = (status: DataSubjectRequestStatus) =>
  `privacy.requests.status.${status}` as "privacy.requests.status.RECEIVED";

interface PrivacyRequestsPanelProperties {
  readonly canManage: boolean;
  readonly canAnonymize: boolean;
  /** Opens another tab prefilled for this request (export / anonymization). */
  readonly onFollowUp: (tab: "exports" | "anonymization", request: DataSubjectRequest) => void;
}

/** Paket 2.6 (§4, §11): register of data subject requests with the 30/60-day deadlines. */
export function PrivacyRequestsPanel({ canManage, canAnonymize, onFollowUp }: PrivacyRequestsPanelProperties) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const [scope, setScope] = useState<DataSubjectRequestScope>("open");
  const [requests, setRequests] = useState<readonly DataSubjectRequest[] | null>(null);
  const [loadError, setLoadError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<DataSubjectRequest | null>(null);
  const users = useUserDirectory(canManage);

  const reload = useCallback(async () => {
    try {
      setRequests(await listDataSubjectRequests(scope));
      setLoadError(null);
    } catch (caught) {
      setLoadError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
    }
  }, [scope]);

  useEffect(() => {
    setRequests(null);
    void reload();
  }, [reload]);

  const replace = (updated: DataSubjectRequest) => {
    setSelected(updated);
    void reload();
  };

  return (
    <div data-testid="privacy-requests">
      <PanelIntro
        actions={
          <>
            <Segmented
              size="sm"
              ariaLabel={t("privacy.requests.scopeLabel")}
              value={scope}
              onChange={setScope}
              items={[
                { value: "open", label: t("privacy.requests.scope.open") },
                { value: "closed", label: t("privacy.requests.scope.closed") },
                { value: "all", label: t("privacy.requests.scope.all") },
              ]}
            />
            {canManage ? (
              <Button size="sm" onClick={() => setCreating(true)} data-testid="privacy-request-create">
                <Plus size={14} /> {t("privacy.requests.create")}
              </Button>
            ) : null}
          </>
        }
      >
        {t("privacy.requests.intro")}
      </PanelIntro>

      {loadError !== null ? (
        <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} />
      ) : requests === null ? (
        <PanelSkeleton className="mt-0" label={t("privacy.tabs.requests")} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<FileText size={18} strokeWidth={1.8} />}
          title={t("privacy.requests.emptyTitle")}
          body={t("privacy.requests.emptyBody")}
        />
      ) : (
        <div className={tableWrapClassName}>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className={`${tableHeadClassName} border-b border-border/70`}>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.type")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.subject")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.received")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.deadline")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.status")}</th>
                <th className="px-3 py-2 text-left">{t("privacy.requests.columns.handler")}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr
                  key={request.id}
                  className={`${tableRowClassName} cursor-pointer`}
                  onClick={() => setSelected(request)}
                  data-testid="privacy-request-row"
                >
                  <td className="px-3 font-medium text-foreground">{t(requestTypeKey(request.type))}</td>
                  <td className="max-w-[240px] truncate px-3">
                    {request.subjectUser === null
                      ? request.subjectLabel
                      : localizePersonName(request.subjectUser.displayName, i18n.language)}
                  </td>
                  <td className="px-3 text-muted-foreground">{format.date(request.receivedAt)}</td>
                  <td className="px-3">
                    <DeadlineBadge request={request} />
                  </td>
                  <td className="px-3">
                    <Badge tone={statusTones[request.status]} dot>
                      {t(statusKey(request.status))}
                    </Badge>
                  </td>
                  <td className="px-3 text-muted-foreground">
                    {request.handlerUser === null
                      ? "—"
                      : localizePersonName(request.handlerUser.displayName, i18n.language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateRequestSheet
        open={creating}
        onOpenChange={setCreating}
        users={users}
        onCreated={(created) => {
          setCreating(false);
          replace(created);
        }}
      />
      <RequestDetailSheet
        request={selected}
        canManage={canManage}
        canAnonymize={canAnonymize}
        onClose={() => setSelected(null)}
        onChanged={replace}
        onFollowUp={(tab, request) => {
          setSelected(null);
          onFollowUp(tab, request);
        }}
      />
    </div>
  );
}

function DeadlineBadge({ request }: { readonly request: DataSubjectRequest }) {
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

function CreateRequestSheet({
  open,
  onOpenChange,
  users,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly users: readonly UserSummary[] | null;
  readonly onCreated: (request: DataSubjectRequest) => void;
}) {
  const { t } = useTranslation();
  const fail = usePrivacyFailure();
  const [type, setType] = useState<DataSubjectRequestType>("ACCESS");
  const [channel, setChannel] = useState<DataSubjectRequestChannel>("EMAIL");
  const [receivedAt, setReceivedAt] = useState(todayInputValue());
  const [subjectLabel, setSubjectLabel] = useState("");
  const [subjectUserId, setSubjectUserId] = useState<string | null>(null);
  const [handlerUserId, setHandlerUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType("ACCESS");
    setChannel("EMAIL");
    setReceivedAt(todayInputValue());
    setSubjectLabel("");
    setSubjectUserId(null);
    setHandlerUserId(null);
    setNotes("");
  }, [open]);

  const valid = subjectLabel.trim().length >= 2 && receivedAt.length === 10 && receivedAt <= todayInputValue();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      onCreated(
        await createDataSubjectRequest({
          type,
          channel,
          receivedAt: dateInputToIso(receivedAt),
          subjectLabel: subjectLabel.trim(),
          ...(subjectUserId !== null ? { subjectUserId } : {}),
          ...(handlerUserId !== null ? { handlerUserId } : {}),
          ...(notes.trim().length > 0 ? { notes: notes.trim() } : {}),
        }),
      );
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full max-w-md flex-col overflow-y-auto p-0" data-testid="privacy-request-sheet">
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle className="text-[15px] font-semibold text-foreground">{t("privacy.requests.create")}</SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {t("privacy.requests.createHint")}
          </SheetDescription>
        </div>
        <form className="flex flex-col gap-4 px-5 py-4" onSubmit={(event) => void submit(event)}>
          <Field label={t("privacy.requests.columns.type")} required>
            <Select value={type} onChange={(event) => setType(event.target.value as DataSubjectRequestType)}>
              {dataSubjectRequestTypes.map((value) => (
                <option key={value} value={value}>
                  {t(requestTypeKey(value))}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("privacy.requests.form.channel")} required>
              <Select value={channel} onChange={(event) => setChannel(event.target.value as DataSubjectRequestChannel)}>
                {dataSubjectRequestChannels.map((value) => (
                  <option key={value} value={value}>
                    {t(channelKey(value))}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("privacy.requests.form.receivedAt")} required>
              <Input
                type="date"
                value={receivedAt}
                max={todayInputValue()}
                onChange={(event) => setReceivedAt(event.target.value)}
              />
            </Field>
          </div>
          <Field
            label={t("privacy.requests.form.subjectLabel")}
            hint={t("privacy.requests.form.subjectLabelHint")}
            required
          >
            <Input
              value={subjectLabel}
              maxLength={200}
              onChange={(event) => setSubjectLabel(event.target.value)}
              data-testid="privacy-request-subject-label"
            />
          </Field>
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-foreground">{t("privacy.requests.form.subjectUser")}</p>
            <PersonPicker
              id="privacy-request-subject"
              users={users}
              value={subjectUserId}
              onChange={(user) => {
                setSubjectUserId(user?.id ?? null);
                if (user !== null && subjectLabel.trim().length === 0) setSubjectLabel(user.displayName);
              }}
            />
            <p className={`${hintClassName} mt-1`}>{t("privacy.requests.form.subjectUserHint")}</p>
          </div>
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-foreground">{t("privacy.requests.columns.handler")}</p>
            <PersonPicker
              id="privacy-request-handler"
              users={users}
              value={handlerUserId}
              filter={(user) => user.isActive && user.roleTone !== "user"}
              onChange={(user) => setHandlerUserId(user?.id ?? null)}
            />
          </div>
          <Field label={t("privacy.requests.form.notes")} hint={t("privacy.requests.form.notesHint")}>
            <Textarea value={notes} maxLength={4000} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <p className={hintClassName}>{t("privacy.requests.form.deadlineHint")}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={!valid || busy} data-testid="privacy-request-save">
              {t("privacy.requests.form.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function RequestDetailSheet({
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
      ? ([[t("privacy.requests.detail.extendedDueAt"), format.date(request.extendedDueAt)]] as [string, string][])
      : []),
    ...(request.extensionReason !== null
      ? ([[t("privacy.requests.detail.extensionReason"), request.extensionReason]] as [string, string][])
      : []),
    ...(request.rejectionReason !== null
      ? ([[t("privacy.requests.detail.rejectionReason"), request.rejectionReason]] as [string, string][])
      : []),
    ...(request.resultRef !== null
      ? ([[t("privacy.requests.detail.resultRef"), request.resultRef]] as [string, string][])
      : []),
    ...(request.closedAt !== null
      ? ([[t("privacy.requests.detail.closedAt"), format.date(request.closedAt)]] as [string, string][])
      : []),
  ];
  const canExport =
    canManage && isOpen && request.subjectUser !== null && (request.type === "ACCESS" || request.type === "PORTABILITY");
  const canErase = canAnonymize && isOpen && request.subjectUser !== null && request.type === "ERASURE";
  const rejectionValid = outcome !== "REJECTED" || reason.trim().length >= 10;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full max-w-md flex-col overflow-y-auto p-0" data-testid="privacy-request-detail">
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
              <p className="mb-1 text-[12px] font-medium text-foreground">{t("privacy.requests.form.notes")}</p>
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
                <Button size="sm" variant="outline" onClick={() => onFollowUp("anonymization", request)}>
                  {t("privacy.requests.detail.toAnonymization")}
                </Button>
              ) : null}
              {request.canExtend ? (
                <Button size="sm" variant="outline" onClick={() => setMode("extend")} data-testid="privacy-request-extend">
                  {t("privacy.requests.detail.extend")}
                </Button>
              ) : null}
              <Button size="sm" onClick={() => setMode("close")} data-testid="privacy-request-close">
                {t("privacy.requests.detail.close")}
              </Button>
            </div>
          ) : null}

          {mode === "extend" ? (
            <div className="flex flex-col gap-3 border-t border-border/70 pt-4">
              <p className={hintClassName}>{t("privacy.requests.detail.extendHint")}</p>
              <Field label={t("privacy.requests.detail.extensionReason")} hint={t("privacy.common.minChars", { count: 10 })} required>
                <Textarea value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
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
                ariaLabel={t("privacy.requests.detail.outcome")}
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
                  <Textarea value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
                </Field>
              ) : null}
              <Field label={t("privacy.requests.detail.resultRef")} hint={t("privacy.requests.detail.resultRefHint")}>
                <Input value={resultRef} maxLength={300} onChange={(event) => setResultRef(event.target.value)} />
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
