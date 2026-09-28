import { ShieldAlert, UserX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  errorTextClassName,
  hintClassName,
  sectionTitleClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { localizePersonName } from "@/lib/privacy/privacy-view";
import {
  approveErasure,
  assessAnonymization,
  cancelErasure,
  listAnonymizationCandidates,
  listErasures,
  requestAnonymization,
  type AnonymizationBlockReason,
  type AnonymizationCandidate,
  type Erasure,
  type ErasureStatus,
  type SubjectAssessment,
} from "@/services/privacy-api";
import type { UserSummary } from "@/services/users-api";
import {
  PanelIntro,
  PersonPicker,
  useDateFormat,
  useIdentityGuard,
  usePrivacyFailure,
  useUserDirectory,
} from "./privacy-shared";

const statusTones: Record<ErasureStatus, BadgeTone> = {
  PENDING_APPROVAL: "warning",
  QUEUED: "info",
  RUNNING: "info",
  COMPLETED: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

const erasureStatusKey = (status: ErasureStatus) =>
  `privacy.anonymization.status.${status}` as "privacy.anonymization.status.QUEUED";
const blockerKey = (reason: AnonymizationBlockReason) =>
  `privacy.anonymization.blockers.${reason}` as "privacy.anonymization.blockers.active";
export const countKey = (key: string) => `privacy.counts.${key}` as "privacy.counts.tickets";

interface PrivacyAnonymizationPanelProperties {
  /** From a request or a user profile: open the assessment of this user. */
  readonly initialUserId: string | null;
  readonly requestId: string | null;
  readonly onPrefillConsumed: () => void;
}

/** Paket 2.6 (§6, §11): SUPER_ADMIN only — irreversible, so every step is explicit. */
export function PrivacyAnonymizationPanel({ initialUserId, requestId, onPrefillConsumed }: PrivacyAnonymizationPanelProperties) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const fail = usePrivacyFailure();
  const { toast } = useToast();
  const users = useUserDirectory();
  const [candidates, setCandidates] = useState<readonly AnonymizationCandidate[] | null>(null);
  const [erasures, setErasures] = useState<readonly Erasure[] | null>(null);
  const [loadError, setLoadError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(null);
  const [subject, setSubject] = useState<{ userId: string; requestId: string | null } | null>(null);
  const [manualUserId, setManualUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { guard, dialog } = useIdentityGuard(fail);

  const reload = useCallback(async () => {
    try {
      const [loadedCandidates, loadedErasures] = await Promise.all([listAnonymizationCandidates(), listErasures()]);
      setCandidates(loadedCandidates);
      setErasures(loadedErasures);
      setLoadError(null);
    } catch (caught) {
      setLoadError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (initialUserId === null) return;
    setSubject({ userId: initialUserId, requestId });
    onPrefillConsumed();
  }, [initialUserId, requestId, onPrefillConsumed]);

  // A queued or running erasure finishes in the worker — follow it without a manual refresh.
  const active = erasures?.some((erasure) => erasure.status === "QUEUED" || erasure.status === "RUNNING") ?? false;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void reload(), 5000);
    return () => window.clearInterval(timer);
  }, [active, reload]);

  const nameOf = useMemo(() => {
    const byId = new Map((users ?? []).map((user) => [user.id, user.displayName]));
    return (userId: string | null) =>
      userId === null ? "—" : localizePersonName(byId.get(userId) ?? userId, i18n.language);
  }, [i18n.language, users]);

  const approve = (erasure: Erasure) =>
    guard(t("privacy.anonymization.approveTitle", { name: localizePersonName(erasure.pseudonym, i18n.language) }), async (code) => {
      setBusy(erasure.id);
      try {
        await approveErasure(erasure.id, code);
        toast({ title: t("privacy.anonymization.approvedToast"), tone: "success" });
        await reload();
      } finally {
        setBusy(null);
      }
    });

  const cancel = async (erasure: Erasure) => {
    setBusy(erasure.id);
    try {
      await cancelErasure(erasure.id);
      await reload();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(null);
    }
  };

  if (loadError !== null) return <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} />;
  if (candidates === null || erasures === null) {
    return <PanelSkeleton className="mt-0" label={t("privacy.tabs.anonymization")} />;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="privacy-anonymization">
      <PanelIntro>{t("privacy.anonymization.intro")}</PanelIntro>

      <section>
        <h2 className={`${sectionTitleClassName} mb-2`}>{t("privacy.anonymization.candidatesTitle")}</h2>
        {candidates.length === 0 ? (
          <EmptyState
            icon={<UserX size={18} strokeWidth={1.8} />}
            title={t("privacy.anonymization.candidatesEmptyTitle")}
            body={t("privacy.anonymization.candidatesEmptyBody")}
          />
        ) : (
          <div className={tableWrapClassName}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className={`${tableHeadClassName} border-b border-border/70`}>
                  <th className="px-3 py-2 text-left">{t("privacy.anonymization.columns.user")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.anonymization.columns.inactiveSince")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.anonymization.columns.deactivatedBy")}</th>
                  <th className="px-3 py-2 text-right">{t("privacy.anonymization.columns.tickets")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.id} className={tableRowClassName} data-testid="privacy-candidate-row">
                    <td className="px-3">
                      <span className="font-medium text-foreground">{candidate.displayName}</span>
                      <span className={`${hintClassName} ml-2`}>{candidate.email}</span>
                    </td>
                    <td className="px-3 text-muted-foreground">{format.date(candidate.inactiveSince)}</td>
                    <td className="px-3 text-muted-foreground">
                      {t(`privacy.anonymization.deactivatedBy.${candidate.deactivatedBy}` as "privacy.anonymization.deactivatedBy.admin")}
                    </td>
                    <td className="tnum px-3 text-right">{candidate.requestedTickets}</td>
                    <td className="px-2 text-right">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setSubject({ userId: candidate.id, requestId: null })}
                        data-testid="privacy-candidate-review"
                      >
                        {t("privacy.anonymization.review")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex max-w-xl flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <p className="mb-1.5 text-[12.5px] font-medium text-foreground">{t("privacy.anonymization.otherUser")}</p>
            <PersonPicker
              id="privacy-anonymize-user"
              users={users}
              value={manualUserId}
              filter={(user) => !user.isActive && !user.anonymizedAt}
              onChange={(user) => setManualUserId(user?.id ?? null)}
              placeholder={t("privacy.anonymization.otherUserPlaceholder")}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={manualUserId === null}
            onClick={() => manualUserId !== null && setSubject({ userId: manualUserId, requestId: null })}
          >
            {t("privacy.anonymization.review")}
          </Button>
        </div>
        <p className={`${hintClassName} mt-1`}>{t("privacy.anonymization.otherUserHint")}</p>
      </section>

      <section>
        <h2 className={`${sectionTitleClassName} mb-2`}>{t("privacy.anonymization.historyTitle")}</h2>
        {erasures.length === 0 ? (
          <p className={hintClassName}>{t("privacy.anonymization.historyEmpty")}</p>
        ) : (
          <div className={tableWrapClassName}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className={`${tableHeadClassName} border-b border-border/70`}>
                  <th className="px-3 py-2 text-left">{t("privacy.anonymization.columns.pseudonym")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.anonymization.columns.status")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.anonymization.columns.requestedBy")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.anonymization.columns.approvedBy")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.anonymization.columns.created")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.anonymization.columns.completed")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {erasures.map((erasure) => (
                  <tr key={erasure.id} className={tableRowClassName} data-testid="privacy-erasure-row">
                    <td className="px-3 font-medium text-foreground">
                      {localizePersonName(erasure.pseudonym, i18n.language)}
                    </td>
                    <td className="px-3">
                      <Badge tone={statusTones[erasure.status]} dot>
                        {t(erasureStatusKey(erasure.status))}
                      </Badge>
                      {erasure.status === "PENDING_APPROVAL" && erasure.approvalDeadline !== null ? (
                        <span className={`${hintClassName} ml-2`}>
                          {t("privacy.anonymization.approvalUntil", { date: format.date(erasure.approvalDeadline) })}
                        </span>
                      ) : null}
                      {erasure.error !== null ? (
                        <p className={`${errorTextClassName} mt-1 text-[11.5px]`}>{describeErasureError(erasure.error, (reason) => t(blockerKey(reason), { defaultValue: reason }))}</p>
                      ) : null}
                    </td>
                    <td className="px-3 text-muted-foreground">{nameOf(erasure.requestedByUserId)}</td>
                    <td className="px-3 text-muted-foreground">{nameOf(erasure.approvedByUserId)}</td>
                    <td className="px-3 text-muted-foreground">{format.dateTime(erasure.createdAt)}</td>
                    <td className="px-3 text-muted-foreground">{format.dateTime(erasure.completedAt)}</td>
                    <td className="whitespace-nowrap px-2 text-right">
                      {erasure.status === "PENDING_APPROVAL" ? (
                        <span className="inline-flex gap-1.5">
                          <Button
                            size="xs"
                            disabled={busy === erasure.id}
                            onClick={() => void approve(erasure)}
                            data-testid="privacy-erasure-approve"
                          >
                            {t("privacy.anonymization.approve")}
                          </Button>
                          <Button size="xs" variant="outline" disabled={busy === erasure.id} onClick={() => void cancel(erasure)}>
                            {t("privacy.anonymization.cancel")}
                          </Button>
                        </span>
                      ) : erasure.status === "COMPLETED" && erasure.report !== null ? (
                        <ErasureReportButton erasure={erasure} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AssessmentSheet
        subject={subject}
        users={users}
        onClose={() => setSubject(null)}
        guard={guard}
        onRequested={(erasure) => {
          setSubject(null);
          toast({
            title:
              erasure.status === "PENDING_APPROVAL"
                ? t("privacy.anonymization.pendingToast")
                : t("privacy.anonymization.queuedToast"),
            tone: "success",
          });
          void reload();
        }}
      />
      {dialog}
    </div>
  );
}

function describeErasureError(error: string, label: (reason: AnonymizationBlockReason) => string): string {
  // "blocked:active,legal_hold" → the blocker labels; anything else as stored.
  if (error.startsWith("blocked:")) {
    return error
      .slice("blocked:".length)
      .split(",")
      .map((reason) => label(reason as AnonymizationBlockReason))
      .join(" · ");
  }
  return error;
}

function CountsTable({ counts }: { readonly counts: Readonly<Record<string, unknown>> }) {
  const { t, i18n } = useTranslation();
  const entries = Object.entries(counts).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0,
  );
  if (entries.length === 0) return <p className={hintClassName}>{t("privacy.anonymization.nothingToChange")}</p>;
  const number = new Intl.NumberFormat(i18n.language);
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[12.5px]">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{t(countKey(key), { defaultValue: key })}</dt>
          <dd className="tnum text-right text-foreground">{number.format(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ErasureReportButton({ erasure }: { readonly erasure: Erasure }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
        {t("privacy.anonymization.report")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full max-w-md flex-col overflow-y-auto p-0">
          <div className="border-b border-border/70 px-5 py-4">
            <SheetTitle className="text-[15px] font-semibold text-foreground">
              {localizePersonName(erasure.pseudonym, i18n.language)}
            </SheetTitle>
            <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
              {t("privacy.anonymization.reportHint")}
            </SheetDescription>
          </div>
          <div className="px-5 py-4">
            <CountsTable counts={erasure.report ?? {}} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function AssessmentSheet({
  subject,
  users,
  onClose,
  guard,
  onRequested,
}: {
  readonly subject: { userId: string; requestId: string | null } | null;
  readonly users: readonly UserSummary[] | null;
  readonly onClose: () => void;
  readonly guard: (title: string, action: (code?: string) => Promise<void>) => Promise<void>;
  readonly onRequested: (erasure: Erasure) => void;
}) {
  const { t, i18n } = useTranslation();
  const [assessment, setAssessment] = useState<SubjectAssessment | null>(null);
  const [error, setError] = useState<ApiErrorKey | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleteOwnAttachments, setDeleteOwnAttachments] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (subject === null) return;
    let cancelled = false;
    setAssessment(null);
    setError(null);
    setConfirmEmail("");
    assessAnonymization(subject.userId)
      .then((loaded) => {
        if (cancelled) return;
        setAssessment(loaded);
        setDeleteOwnAttachments(loaded.deleteOwnAttachmentsDefault);
      })
      .catch((caught: unknown) => !cancelled && setError(mapApiError(caught)));
    return () => {
      cancelled = true;
    };
  }, [subject]);

  const emailMatches =
    assessment !== null && confirmEmail.trim().toLowerCase() === assessment.email.trim().toLowerCase();
  const blocked = assessment !== null && assessment.blockers.length > 0;
  const fallbackName = users?.find((user) => user.id === subject?.userId)?.displayName ?? "";

  const submit = () => {
    if (assessment === null || subject === null || !emailMatches || blocked) return;
    setSubmitting(true);
    void guard(t("privacy.anonymization.confirmTitle", { name: assessment.displayName }), async (code) => {
      const erasure = await requestAnonymization(assessment.userId, {
        confirmEmail: confirmEmail.trim(),
        deleteOwnAttachments,
        ...(subject.requestId !== null ? { requestId: subject.requestId } : {}),
        ...(code !== undefined ? { code } : {}),
      });
      onRequested(erasure);
    }).finally(() => setSubmitting(false));
  };

  return (
    <Sheet open={subject !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full max-w-lg flex-col overflow-y-auto p-0" data-testid="privacy-assessment">
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle className="text-[15px] font-semibold text-foreground">
            {t("privacy.anonymization.assessTitle", {
              name: localizePersonName(assessment?.displayName ?? fallbackName, i18n.language),
            })}
          </SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">{assessment?.email ?? ""}</SheetDescription>
        </div>
        <div className="flex flex-col gap-5 px-5 py-4">
          {error !== null ? (
            <ApiErrorText messageKey={error} />
          ) : assessment === null ? (
            <PanelSkeleton className="mt-0" label={t("privacy.anonymization.assessTitle", { name: "" })} />
          ) : (
            <>
              {blocked ? (
                <div className="rounded-md border border-danger/30 bg-danger/6 px-3 py-2.5" data-testid="privacy-blockers">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-danger">
                    <ShieldAlert size={14} aria-hidden="true" /> {t("privacy.anonymization.blockedTitle")}
                  </p>
                  <ul className="list-disc pl-5 text-[12.5px] text-foreground/90">
                    {assessment.blockers.map((reason) => (
                      <li key={reason}>{t(blockerKey(reason))}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {assessment.preview !== null ? (
                <section className="flex flex-col gap-3">
                  <h3 className={sectionTitleClassName}>{t("privacy.anonymization.previewTitle")}</h3>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {(
                      [
                        ["ticketsInScope", assessment.preview.ticketsInScope],
                        ["ticketsOnLegalHold", assessment.preview.ticketsOnLegalHold],
                        ["textReplacements", assessment.preview.textReplacements],
                      ] as const
                    ).map(([key, value]) => (
                      <div key={key} className="rounded-md border border-border/70 px-2 py-2">
                        <p className="tnum text-[16px] font-semibold text-foreground">{value}</p>
                        <p className={hintClassName}>{t(`privacy.anonymization.preview.${key}` as "privacy.anonymization.preview.ticketsInScope")}</p>
                      </div>
                    ))}
                  </div>
                  {assessment.preview.examples.length > 0 ? (
                    <div>
                      <p className="mb-1 text-[12px] font-medium text-foreground">{t("privacy.anonymization.examples")}</p>
                      <ul className="flex flex-col gap-1.5">
                        {assessment.preview.examples.map((example, index) => (
                          <li
                            key={index}
                            className="whitespace-pre-wrap rounded-md border border-border/70 bg-elevated px-3 py-1.5 text-[12px]"
                          >
                            {example}
                          </li>
                        ))}
                      </ul>
                      <p className={`${hintClassName} mt-1`}>{t("privacy.anonymization.examplesHint")}</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-1 text-[12px] font-medium text-foreground">{t("privacy.anonymization.countsTitle")}</p>
                    <CountsTable counts={assessment.preview.counts} />
                  </div>
                </section>
              ) : null}

              {!blocked ? (
                <section className="flex flex-col gap-3 border-t border-border/70 pt-4">
                  <Checkbox
                    checked={deleteOwnAttachments}
                    onChange={(event) => setDeleteOwnAttachments(event.target.checked)}
                    label={t("privacy.anonymization.deleteOwnAttachments")}
                  />
                  <p className={`${hintClassName} -mt-1 pl-6`}>{t("privacy.anonymization.deleteOwnAttachmentsHint")}</p>
                  {assessment.requireSecondApprover ? (
                    <p className="rounded-md border border-warning/30 bg-warning/6 px-3 py-2 text-[12px]">
                      {t("privacy.anonymization.secondApproverNote")}
                    </p>
                  ) : null}
                  <Field
                    label={t("privacy.anonymization.confirmEmail")}
                    hint={t("privacy.anonymization.confirmEmailHint")}
                    required
                  >
                    <Input
                      value={confirmEmail}
                      autoComplete="off"
                      onChange={(event) => setConfirmEmail(event.target.value)}
                      onPaste={(event) => event.preventDefault()}
                      data-testid="privacy-confirm-email"
                    />
                  </Field>
                  <p className="text-[12px] text-danger">{t("privacy.anonymization.irreversible")}</p>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={onClose}>
                      {t("ui.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={!emailMatches || submitting}
                      onClick={submit}
                      data-testid="privacy-anonymize-submit"
                    >
                      {assessment.requireSecondApprover
                        ? t("privacy.anonymization.submitForApproval")
                        : t("privacy.anonymization.submit")}
                    </Button>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
