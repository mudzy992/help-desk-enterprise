import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { acknowledgementPercent, mapAnnouncementError } from "@/lib/announcements/announcement-view";
import { triggerBlobDownload } from "@/lib/download/trigger-blob-download";
import { mapApiError } from "@/lib/map-api-error";
import {
  downloadAnnouncementReport,
  getAnnouncementReport,
  remindAnnouncement,
  type AnnouncementReport,
} from "@/services/announcements-api";

interface AnnouncementReportDialogProperties {
  readonly announcementId: string | null;
  readonly onOpenChange: (open: boolean) => void;
}

/** Paket 2.9 (K2, §3.3): acknowledged X of Y, per unit, who is missing, CSV and one reminder per 24 h. */
export function AnnouncementReportDialog({ announcementId, onOpenChange }: AnnouncementReportDialogProperties) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [report, setReport] = useState<AnnouncementReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"csv" | "remind" | null>(null);

  const load = useCallback(async (id: string) => {
    setError(null);
    try {
      setReport(await getAnnouncementReport(id));
    } catch (caught) {
      setError(t(mapAnnouncementError(caught) ?? mapApiError(caught)));
    }
  }, [t]);

  useEffect(() => {
    setReport(null);
    if (announcementId !== null) void load(announcementId);
  }, [announcementId, load]);

  const download = async () => {
    if (announcementId === null) return;
    setBusy("csv");
    try {
      const file = await downloadAnnouncementReport(announcementId);
      triggerBlobDownload(file.blob, file.fileName);
    } catch (caught) {
      toast({ tone: "danger", title: t(mapAnnouncementError(caught) ?? mapApiError(caught)) });
    } finally {
      setBusy(null);
    }
  };

  const remind = async () => {
    if (announcementId === null) return;
    setBusy("remind");
    try {
      const result = await remindAnnouncement(announcementId);
      toast({ tone: "success", title: t("announcements.report.reminded", { count: result.notified }) });
      await load(announcementId);
    } catch (caught) {
      toast({ tone: "danger", title: t(mapAnnouncementError(caught) ?? mapApiError(caught)) });
    } finally {
      setBusy(null);
    }
  };

  const formatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });
  const percent = report === null ? 0 : acknowledgementPercent(report.acknowledgedCount, report.audienceSizeAtPublish);

  return (
    <Modal open={announcementId !== null} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl">
        <ModalHeader title={t("announcements.report.title")} description={report?.title} />
        {error ? (
          <p role="alert" className={errorTextClassName}>
            {error}
          </p>
        ) : report === null ? (
          <PanelSkeleton label={t("ui.loading")} />
        ) : (
          <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
            {!report.requiresAcknowledgement ? <p className={hintClassName}>{t("announcements.report.noAcknowledgement")}</p> : null}
            <div className="grid gap-1.5">
              <p className="text-[13px] font-medium text-foreground">
                {t("announcements.report.summary", {
                  acknowledged: report.acknowledgedCount,
                  audience: report.audienceSizeAtPublish,
                  percent,
                })}
              </p>
              <Progress value={percent} tone={percent >= 100 ? "success" : "primary"} />
              <p className={hintClassName}>
                {t("announcements.report.audienceNote", { current: report.currentAudienceSize })}
              </p>
            </div>

            {report.byUnit.length > 0 ? (
              <table className="w-full text-left text-[12.5px]">
                <caption className="sr-only">{t("announcements.report.byUnit")}</caption>
                <thead className="text-[11.5px] text-muted-foreground">
                  <tr className="border-b border-border">
                    <th scope="col" className="py-1.5 pr-2 font-medium">{t("announcements.report.unit")}</th>
                    <th scope="col" className="py-1.5 pr-2 text-right font-medium">{t("announcements.report.acknowledgedColumn")}</th>
                    <th scope="col" className="py-1.5 text-right font-medium">{t("announcements.report.audienceColumn")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byUnit.map((row) => (
                    <tr key={row.unit} className="border-b border-border/60">
                      <th scope="row" className="py-1.5 pr-2 font-normal">{row.unit || t("announcements.report.noUnit")}</th>
                      <td className="tnum py-1.5 pr-2 text-right">{row.acknowledged}</td>
                      <td className="tnum py-1.5 text-right">{row.audience}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {report.requiresAcknowledgement ? (
              <div className="grid gap-1.5">
                <h3 className="text-[12.5px] font-semibold text-foreground">
                  {t("announcements.report.pending", { count: report.pendingCount })}
                </h3>
                {report.pending.length === 0 ? (
                  <p className={hintClassName}>{t("announcements.report.nonePending")}</p>
                ) : (
                  <ul className="grid gap-1 text-[12.5px]">
                    {report.pending.map((person) => (
                      <li key={person.id}>
                        {person.displayName}
                        {person.unit ? <span className="text-muted-foreground"> · {person.unit}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {report.pendingCount > report.pending.length ? (
                  <p className={hintClassName}>{t("announcements.report.pendingMore", { count: report.pendingCount - report.pending.length })}</p>
                ) : null}
                {report.lastReminderAt ? (
                  <p className={hintClassName}>
                    {t("announcements.report.lastReminder", { at: formatter.format(new Date(report.lastReminderAt)) })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={() => void download()} disabled={report === null || busy !== null}>
            <Download aria-hidden />
            {t("announcements.report.csv")}
          </Button>
          {report?.requiresAcknowledgement ? (
            <Button onClick={() => void remind()} disabled={!report.canRemind || report.pendingCount === 0 || busy !== null}>
              <BellRing aria-hidden />
              {t("announcements.report.remind")}
            </Button>
          ) : null}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
