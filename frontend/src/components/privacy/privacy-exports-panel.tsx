import { Download, PackageOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Field, Textarea } from "@/components/ui/field";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import { mapApiError, readApiRequestId, type ApiErrorKey } from "@/lib/map-api-error";
import { formatBytes, localizePersonName } from "@/lib/privacy/privacy-view";
import {
  createPrivacyExport,
  downloadPrivacyExport,
  listPrivacyExports,
  type ExportStatus,
  type PrivacyExport,
} from "@/services/privacy-api";
import { PanelIntro, PersonPicker, useDateFormat, useIdentityGuard, usePrivacyFailure, useUserDirectory } from "./privacy-shared";
import { ScrollRegion } from "@/components/ui/scroll-region";

const statusTones: Record<ExportStatus, BadgeTone> = {
  QUEUED: "info",
  RUNNING: "info",
  READY: "success",
  FAILED: "danger",
  EXPIRED: "neutral",
};
const statusKey = (status: ExportStatus) => `privacy.exports.status.${status}` as "privacy.exports.status.READY";

interface PrivacyExportsPanelProperties {
  readonly initialSubjectId: string | null;
  readonly requestId: string | null;
  readonly onPrefillConsumed: () => void;
}

/** Paket 2.6 (§5, §11): access / portability export — only the requester downloads, with MFA. */
export function PrivacyExportsPanel({ initialSubjectId, requestId, onPrefillConsumed }: PrivacyExportsPanelProperties) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const { toast } = useToast();
  const fail = usePrivacyFailure();
  const users = useUserDirectory();
  const [exports, setExports] = useState<readonly PrivacyExport[] | null>(null);
  const [loadError, setLoadError] = useState<{ key: ApiErrorKey; requestId: string | null } | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [linkedRequestId, setLinkedRequestId] = useState<string | null>(null);
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [includeInternalNotes, setIncludeInternalNotes] = useState(false);
  const [notesReason, setNotesReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const { guard, dialog } = useIdentityGuard(fail);

  const reload = useCallback(async () => {
    try {
      setExports(await listPrivacyExports());
      setLoadError(null);
    } catch (caught) {
      setLoadError({ key: mapApiError(caught), requestId: readApiRequestId(caught) });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (initialSubjectId === null) return;
    setSubjectId(initialSubjectId);
    setLinkedRequestId(requestId);
    onPrefillConsumed();
  }, [initialSubjectId, requestId, onPrefillConsumed]);

  const building = exports?.some((item) => item.status === "QUEUED" || item.status === "RUNNING") ?? false;
  useEffect(() => {
    if (!building) return;
    const timer = window.setInterval(() => void reload(), 5000);
    return () => window.clearInterval(timer);
  }, [building, reload]);

  const reasonValid = !includeInternalNotes || notesReason.trim().length >= 10;

  const create = async () => {
    if (subjectId === null || !reasonValid) return;
    setCreating(true);
    try {
      await createPrivacyExport({
        subjectUserId: subjectId,
        includeAttachments,
        includeInternalNotes,
        ...(includeInternalNotes ? { internalNotesReason: notesReason.trim() } : {}),
        ...(linkedRequestId !== null ? { requestId: linkedRequestId } : {}),
      });
      toast({ title: t("privacy.exports.queuedToast"), tone: "success" });
      setSubjectId(null);
      setLinkedRequestId(null);
      setIncludeInternalNotes(false);
      setNotesReason("");
      await reload();
    } catch (caught) {
      fail(caught);
    } finally {
      setCreating(false);
    }
  };

  const download = (item: PrivacyExport) =>
    guard(t("privacy.exports.downloadTitle", { name: localizePersonName(item.subjectName, i18n.language) }), async (code) => {
      setDownloading(item.id);
      try {
        const file = await downloadPrivacyExport(item.id, code);
        triggerBlobDownload(file.blob, file.fileName ?? `export-${item.id}.zip`);
        await reload();
      } finally {
        setDownloading(null);
      }
    });

  if (loadError !== null) return <ApiErrorText messageKey={loadError.key} requestId={loadError.requestId} />;
  if (exports === null) return <PanelSkeleton className="mt-0" label={t("privacy.tabs.exports")} />;

  return (
    <div className="flex flex-col gap-6" data-testid="privacy-exports">
      <PanelIntro>{t("privacy.exports.intro")}</PanelIntro>

      <Card className="flex max-w-2xl flex-col gap-3 p-4">
        <h2 className={sectionTitleClassName}>{t("privacy.exports.createTitle")}</h2>
        <div>
          <p className="mb-1.5 text-[12.5px] font-medium text-foreground">{t("privacy.exports.subject")}</p>
          <PersonPicker
            id="privacy-export-subject"
            users={users}
            value={subjectId}
            filter={(user) => !user.anonymizedAt}
            onChange={(user) => setSubjectId(user?.id ?? null)}
            testId="privacy-export-subject"
          />
          {linkedRequestId !== null ? (
            <p className={`${hintClassName} mt-1`}>{t("privacy.exports.linkedRequest")}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2.5">
          <Checkbox
            checked={includeAttachments}
            onChange={(event) => setIncludeAttachments(event.target.checked)}
            label={t("privacy.exports.includeAttachments")}
          />
          <Checkbox
            checked={includeInternalNotes}
            onChange={(event) => setIncludeInternalNotes(event.target.checked)}
            label={t("privacy.exports.includeInternalNotes")}
          />
        </div>
        {includeInternalNotes ? (
          <Field
            label={t("privacy.exports.internalNotesReason")}
            hint={t("privacy.exports.internalNotesReasonHint")}
            required
          >
            <Textarea value={notesReason} maxLength={1000} onChange={(event) => setNotesReason(event.target.value)} />
          </Field>
        ) : null}
        <p className={hintClassName}>{t("privacy.exports.handoverHint")}</p>
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={subjectId === null || !reasonValid || creating}
            onClick={() => void create()}
            data-testid="privacy-export-create"
          >
            <PackageOpen size={14} /> {t("privacy.exports.create")}
          </Button>
        </div>
      </Card>

      <section>
        <h2 className={`${sectionTitleClassName} mb-2`}>{t("privacy.exports.listTitle")}</h2>
        {exports.length === 0 ? (
          <EmptyState
            icon={<PackageOpen size={18} strokeWidth={1.8} />}
            title={t("privacy.exports.emptyTitle")}
            body={t("privacy.exports.emptyBody")}
          />
        ) : (
          <ScrollRegion className={tableWrapClassName}>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className={`${tableHeadClassName} border-b border-border/70`}>
                  <th className="px-3 py-2 text-left">{t("privacy.exports.subject")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.exports.columns.status")}</th>
                  <th className="px-3 py-2 text-right">{t("privacy.exports.columns.size")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.exports.columns.created")}</th>
                  <th className="px-3 py-2 text-left">{t("privacy.exports.columns.expires")}</th>
                  <th className="px-3 py-2 text-right">{t("privacy.exports.columns.downloads")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {exports.map((item) => (
                  <tr key={item.id} className={tableRowClassName} data-testid="privacy-export-row">
                    <td className="px-3">
                      <span className="font-medium text-foreground">
                        {localizePersonName(item.subjectName, i18n.language)}
                      </span>
                      {item.includeInternalNotes ? (
                        <Badge tone="warning" className="ml-2">
                          {t("privacy.exports.withInternalNotes")}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-3">
                      <Badge tone={statusTones[item.status]} dot>
                        {t(statusKey(item.status))}
                      </Badge>
                      {item.error !== null ? (
                        <p className={`${errorTextClassName} mt-1 text-[11.5px]`}>{item.error}</p>
                      ) : null}
                    </td>
                    <td className="tnum px-3 text-right">{formatBytes(item.sizeBytes, i18n.language)}</td>
                    <td className="px-3 text-muted-foreground">{format.dateTime(item.createdAt)}</td>
                    <td className="px-3 text-muted-foreground">{format.date(item.expiresAt)}</td>
                    <td className="tnum px-3 text-right">{item.downloadCount}</td>
                    <td className="px-2 text-right">
                      {item.status === "READY" ? (
                        item.canDownload ? (
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={downloading === item.id}
                            onClick={() => void download(item)}
                            data-testid="privacy-export-download"
                          >
                            <Download size={13} /> {t("privacy.exports.download")}
                          </Button>
                        ) : (
                          <span className={hintClassName} title={t("privacy.exports.onlyRequesterHint")}>
                            {t("privacy.exports.onlyRequester")}
                          </span>
                        )
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        )}
      </section>
      {dialog}
    </div>
  );
}
