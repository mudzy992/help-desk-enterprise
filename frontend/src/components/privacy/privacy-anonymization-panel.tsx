import {
  AssessmentSheet,
  ErasureReportButton,
  blockerKey,
  describeErasureError,
} from "./privacy-anonymization-details";
import { UserX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useVisibilityAwarePolling } from "@/lib/async/use-visibility-aware-polling";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  errorTextClassName,
  hintClassName,
  sectionTitleClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { localizePersonName } from "@/lib/privacy/privacy-view";
import {
  approveErasure,
  cancelErasure,
  listAnonymizationCandidates,
  listErasures,
  type AnonymizationCandidate,
  type Erasure,
  type ErasureStatus,
} from "@/services/privacy-api";
import {
  PanelIntro,
  PersonPicker,
  useDateFormat,
  useIdentityGuard,
  usePrivacyFailure,
  useUserDirectory,
} from "./privacy-shared";
import { ScrollRegion } from "@/components/ui/scroll-region";

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
interface PrivacyAnonymizationPanelProperties {
  /** From a request or a user profile: open the assessment of this user. */
  readonly initialUserId: string | null;
  readonly requestId: string | null;
  readonly onPrefillConsumed: () => void;
}

/** Paket 2.6 (§6, §11): SUPER_ADMIN only — irreversible, so every step is explicit. */
export function PrivacyAnonymizationPanel({
  initialUserId,
  requestId,
  onPrefillConsumed,
}: PrivacyAnonymizationPanelProperties) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const fail = usePrivacyFailure();
  const { toast } = useToast();
  const users = useUserDirectory();
  const [candidates, setCandidates] = useState<readonly AnonymizationCandidate[] | null>(null);
  const [erasures, setErasures] = useState<readonly Erasure[] | null>(null);
  const [loadError, setLoadError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(
    null,
  );
  const [subject, setSubject] = useState<{ userId: string; requestId: string | null } | null>(null);
  const [manualUserId, setManualUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { guard, dialog } = useIdentityGuard(fail);

  const reload = useCallback(async () => {
    try {
      const [loadedCandidates, loadedErasures] = await Promise.all([
        listAnonymizationCandidates(),
        listErasures(),
      ]);
      setCandidates(loadedCandidates);
      setErasures(loadedErasures);
      setLoadError(null);
      return true;
    } catch (caught) {
      setLoadError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
      return false;
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
  const active =
    erasures?.some((erasure) => erasure.status === "QUEUED" || erasure.status === "RUNNING") ??
    false;
  useVisibilityAwarePolling({
    poll: async () => {
      if (!(await reload())) throw new Error("Privacy anonymization polling failed");
    },
    intervalMs: 5_000,
    enabled: active,
    telemetryKey: "privacy.anonymization_poll_failed",
  });

  const nameOf = useMemo(() => {
    const byId = new Map((users ?? []).map((user) => [user.id, user.displayName]));
    return (userId: string | null) =>
      userId === null ? "—" : localizePersonName(byId.get(userId) ?? userId, i18n.language);
  }, [i18n.language, users]);

  const approve = (erasure: Erasure) =>
    guard(
      t("privacy.anonymization.approveTitle", {
        name: localizePersonName(erasure.pseudonym, i18n.language),
      }),
      async (code) => {
        setBusy(erasure.id);
        try {
          await approveErasure(erasure.id, code);
          toast({ title: t("privacy.anonymization.approvedToast"), tone: "success" });
          await reload();
        } finally {
          setBusy(null);
        }
      },
    );

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

  if (loadError !== null)
    return <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} />;
  if (candidates === null || erasures === null) {
    return <PanelSkeleton className="mt-0" label={t("privacy.tabs.anonymization")} />;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="privacy-anonymization">
      <PanelIntro>{t("privacy.anonymization.intro")}</PanelIntro>

      <section>
        <h2 className={`${sectionTitleClassName} mb-2`}>
          {t("privacy.anonymization.candidatesTitle")}
        </h2>
        {candidates.length === 0 ? (
          <EmptyState
            icon={<UserX size={18} strokeWidth={1.8} />}
            title={t("privacy.anonymization.candidatesEmptyTitle")}
            body={t("privacy.anonymization.candidatesEmptyBody")}
          />
        ) : (
          <ScrollRegion className={tableWrapClassName}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className={`${tableHeadClassName} border-b border-border/70`}>
                  <th className="px-3 py-2 text-left">{t("privacy.anonymization.columns.user")}</th>
                  <th className="px-3 py-2 text-left">
                    {t("privacy.anonymization.columns.inactiveSince")}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t("privacy.anonymization.columns.deactivatedBy")}
                  </th>
                  <th className="px-3 py-2 text-right">
                    {t("privacy.anonymization.columns.tickets")}
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr
                    key={candidate.id}
                    className={tableRowClassName}
                    data-testid="privacy-candidate-row"
                  >
                    <td className="px-3">
                      <span className="font-medium text-foreground">{candidate.displayName}</span>
                      <span className={`${hintClassName} ml-2`}>{candidate.email}</span>
                    </td>
                    <td className="px-3 text-muted-foreground">
                      {format.date(candidate.inactiveSince)}
                    </td>
                    <td className="px-3 text-muted-foreground">
                      {t(
                        `privacy.anonymization.deactivatedBy.${candidate.deactivatedBy}` as "privacy.anonymization.deactivatedBy.admin",
                      )}
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
          </ScrollRegion>
        )}
        <div className="mt-3 flex max-w-xl flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <p className="mb-1.5 text-[12.5px] font-medium text-foreground">
              {t("privacy.anonymization.otherUser")}
            </p>
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
            onClick={() =>
              manualUserId !== null && setSubject({ userId: manualUserId, requestId: null })
            }
          >
            {t("privacy.anonymization.review")}
          </Button>
        </div>
        <p className={`${hintClassName} mt-1`}>{t("privacy.anonymization.otherUserHint")}</p>
      </section>

      <section>
        <h2 className={`${sectionTitleClassName} mb-2`}>
          {t("privacy.anonymization.historyTitle")}
        </h2>
        {erasures.length === 0 ? (
          <p className={hintClassName}>{t("privacy.anonymization.historyEmpty")}</p>
        ) : (
          <ScrollRegion className={tableWrapClassName}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className={`${tableHeadClassName} border-b border-border/70`}>
                  <th className="px-3 py-2 text-left">
                    {t("privacy.anonymization.columns.pseudonym")}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t("privacy.anonymization.columns.status")}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t("privacy.anonymization.columns.requestedBy")}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t("privacy.anonymization.columns.approvedBy")}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t("privacy.anonymization.columns.created")}
                  </th>
                  <th className="px-3 py-2 text-left">
                    {t("privacy.anonymization.columns.completed")}
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {erasures.map((erasure) => (
                  <tr
                    key={erasure.id}
                    className={tableRowClassName}
                    data-testid="privacy-erasure-row"
                  >
                    <td className="px-3 font-medium text-foreground">
                      {localizePersonName(erasure.pseudonym, i18n.language)}
                    </td>
                    <td className="px-3">
                      <Badge tone={statusTones[erasure.status]} dot>
                        {t(erasureStatusKey(erasure.status))}
                      </Badge>
                      {erasure.status === "PENDING_APPROVAL" &&
                      erasure.approvalDeadline !== null ? (
                        <span className={`${hintClassName} ml-2`}>
                          {t("privacy.anonymization.approvalUntil", {
                            date: format.date(erasure.approvalDeadline),
                          })}
                        </span>
                      ) : null}
                      {erasure.error !== null ? (
                        <p className={`${errorTextClassName} mt-1 text-[11.5px]`}>
                          {describeErasureError(erasure.error, (reason) =>
                            t(blockerKey(reason), { defaultValue: reason }),
                          )}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 text-muted-foreground">
                      {nameOf(erasure.requestedByUserId)}
                    </td>
                    <td className="px-3 text-muted-foreground">
                      {nameOf(erasure.approvedByUserId)}
                    </td>
                    <td className="px-3 text-muted-foreground">
                      {format.dateTime(erasure.createdAt)}
                    </td>
                    <td className="px-3 text-muted-foreground">
                      {format.dateTime(erasure.completedAt)}
                    </td>
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
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={busy === erasure.id}
                            onClick={() => void cancel(erasure)}
                          >
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
          </ScrollRegion>
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
