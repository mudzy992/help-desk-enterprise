import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { hintClassName, sectionTitleClassName } from "@/components/ui/control";
import { Field, Input } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapApiError, type ApiErrorKey } from "@/lib/map-api-error";
import { localizePersonName } from "@/lib/privacy/privacy-view";
import {
  assessAnonymization,
  requestAnonymization,
  type AnonymizationBlockReason,
  type Erasure,
  type SubjectAssessment,
} from "@/services/privacy-api";
import type { UserSummary } from "@/services/users-api";

export const blockerKey = (reason: AnonymizationBlockReason) =>
  `privacy.anonymization.blockers.${reason}` as "privacy.anonymization.blockers.active";
export const countKey = (key: string) => `privacy.counts.${key}` as "privacy.counts.tickets";

export function describeErasureError(
  error: string,
  label: (reason: AnonymizationBlockReason) => string,
): string {
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

export function CountsTable({ counts }: { readonly counts: Readonly<Record<string, unknown>> }) {
  const { t, i18n } = useTranslation();
  const entries = Object.entries(counts).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0,
  );
  if (entries.length === 0)
    return <p className={hintClassName}>{t("privacy.anonymization.nothingToChange")}</p>;
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

export function ErasureReportButton({ erasure }: { readonly erasure: Erasure }) {
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

export function AssessmentSheet({
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
    assessment !== null &&
    confirmEmail.trim().toLowerCase() === assessment.email.trim().toLowerCase();
  const blocked = assessment !== null && assessment.blockers.length > 0;
  const fallbackName = users?.find((user) => user.id === subject?.userId)?.displayName ?? "";

  const submit = () => {
    if (assessment === null || subject === null || !emailMatches || blocked) return;
    setSubmitting(true);
    void guard(
      t("privacy.anonymization.confirmTitle", { name: assessment.displayName }),
      async (code) => {
        const erasure = await requestAnonymization(assessment.userId, {
          confirmEmail: confirmEmail.trim(),
          deleteOwnAttachments,
          ...(subject.requestId !== null ? { requestId: subject.requestId } : {}),
          ...(code !== undefined ? { code } : {}),
        });
        onRequested(erasure);
      },
    ).finally(() => setSubmitting(false));
  };

  return (
    <Sheet open={subject !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="flex w-full max-w-lg flex-col overflow-y-auto p-0"
        data-testid="privacy-assessment"
      >
        <div className="border-b border-border/70 px-5 py-4">
          <SheetTitle className="text-[15px] font-semibold text-foreground">
            {t("privacy.anonymization.assessTitle", {
              name: localizePersonName(assessment?.displayName ?? fallbackName, i18n.language),
            })}
          </SheetTitle>
          <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
            {assessment?.email ?? ""}
          </SheetDescription>
        </div>
        <div className="flex flex-col gap-5 px-5 py-4">
          {error !== null ? (
            <ApiErrorText messageKey={error} />
          ) : assessment === null ? (
            <PanelSkeleton
              className="mt-0"
              label={t("privacy.anonymization.assessTitle", { name: "" })}
            />
          ) : (
            <>
              {blocked ? (
                <div
                  className="rounded-md border border-danger/30 bg-danger/6 px-3 py-2.5"
                  data-testid="privacy-blockers"
                >
                  <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-danger">
                    <ShieldAlert size={14} aria-hidden="true" />{" "}
                    {t("privacy.anonymization.blockedTitle")}
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
                  <h3 className={sectionTitleClassName}>
                    {t("privacy.anonymization.previewTitle")}
                  </h3>
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
                        <p className={hintClassName}>
                          {t(
                            `privacy.anonymization.preview.${key}` as "privacy.anonymization.preview.ticketsInScope",
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                  {assessment.preview.examples.length > 0 ? (
                    <div>
                      <p className="mb-1 text-[12px] font-medium text-foreground">
                        {t("privacy.anonymization.examples")}
                      </p>
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
                      <p className={`${hintClassName} mt-1`}>
                        {t("privacy.anonymization.examplesHint")}
                      </p>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-1 text-[12px] font-medium text-foreground">
                      {t("privacy.anonymization.countsTitle")}
                    </p>
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
                  <p className={`${hintClassName} -mt-1 pl-6`}>
                    {t("privacy.anonymization.deleteOwnAttachmentsHint")}
                  </p>
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
                    {(control) => (
                      <Input
                        {...control}
                        value={confirmEmail}
                        autoComplete="off"
                        onChange={(event) => setConfirmEmail(event.target.value)}
                        onPaste={(event) => event.preventDefault()}
                        data-testid="privacy-confirm-email"
                      />
                    )}
                  </Field>
                  <p className="text-[12px] text-danger">
                    {t("privacy.anonymization.irreversible")}
                  </p>
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
