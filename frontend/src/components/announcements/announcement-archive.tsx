import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkdownView } from "@/components/privacy/markdown-view";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  announcementDateTimeFormatter,
  announcementSeverityKeys,
  mapAnnouncementError,
  severityTone,
} from "@/lib/announcements/announcement-view";
import { mapApiError } from "@/lib/map-api-error";
import { announcementQueryKeys, getAnnouncementArchive } from "@/services/announcements-api";

export function AnnouncementArchive() {
  const { t, i18n } = useTranslation();
  const { data, error, isLoading } = useQuery({
    queryKey: announcementQueryKeys.archive,
    queryFn: getAnnouncementArchive,
    retry: false,
  });
  const [searchParams] = useSearchParams();
  const openId = searchParams.get("open");
  useEffect(() => {
    if (openId === null || data === undefined) return;
    const element = document.getElementById(`announcement-${openId}`);
    if (element instanceof HTMLDetailsElement) {
      element.open = true;
      element.scrollIntoView({ block: "start" });
      element.querySelector("summary")?.focus({ preventScroll: true });
    }
  }, [openId, data]);
  const formatter = announcementDateTimeFormatter(i18n.language);
  if (isLoading) return <PanelSkeleton label={t("ui.loading")} />;
  if (error) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapAnnouncementError(error) ?? mapApiError(error))}
      </p>
    );
  }
  if (data === undefined || data.length === 0) {
    return (
      <EmptyState
        icon={<Megaphone size={18} />}
        title={t("announcements.archive.emptyTitle")}
        body={t("announcements.archive.emptyBody")}
      />
    );
  }
  return (
    <ul className="grid gap-3" aria-label={t("announcements.archive.label")}>
      {data.map((item) => (
        <li key={item.id}>
          <Card>
            <details className="group" id={`announcement-${item.id}`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70">
                <Badge tone={severityTone(item.severity)}>
                  {t(announcementSeverityKeys[item.severity])}
                </Badge>
                <span className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">
                  {item.title}
                </span>
                {item.requiresAcknowledgement ? (
                  item.acknowledgedAt ? (
                    <Badge tone="success">
                      {t("announcements.archive.acknowledgedAt", {
                        at: formatter.format(new Date(item.acknowledgedAt)),
                      })}
                    </Badge>
                  ) : (
                    <Badge tone="warning">{t("announcements.archive.notAcknowledged")}</Badge>
                  )
                ) : null}
                <span className="text-[11.5px] text-muted-foreground">
                  {formatter.format(new Date(item.startsAt))} –{" "}
                  {formatter.format(new Date(item.endsAt))}
                </span>
              </summary>
              <div className="border-t border-border/70 px-4 py-3">
                {item.serviceName ? (
                  <p className={hintClassName}>
                    {t("announcements.banner.service", { name: item.serviceName })}
                  </p>
                ) : null}
                <MarkdownView
                  source={item.body}
                  className="grid gap-2 text-[12.5px] leading-5 text-foreground"
                />
              </div>
            </details>
          </Card>
        </li>
      ))}
    </ul>
  );
}
