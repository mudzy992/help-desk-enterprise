import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlertOctagon, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Info, Megaphone, X } from "lucide-react";
import { MarkdownView } from "@/components/privacy/markdown-view";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalTitle } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  announcementToneClasses,
  mapAnnouncementError,
  modalShowsLeft,
  recordModalShown,
  severityRole,
  severityTone,
} from "@/lib/announcements/announcement-view";
import { mapApiError } from "@/lib/map-api-error";
import { cn } from "@/lib/utils";
import {
  acknowledgeAnnouncement,
  announcementQueryKeys,
  dismissAnnouncement,
  getActiveAnnouncements,
  type ActiveAnnouncement,
  type ActiveAnnouncements,
  type AnnouncementSeverity,
} from "@/services/announcements-api";

const pollMs = 60_000;

const severityKeys = {
  INFO: "announcements.severity.INFO",
  WARNING: "announcements.severity.WARNING",
  CRITICAL: "announcements.severity.CRITICAL",
} as const;

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function SeverityIcon({ severity, className }: { readonly severity: AnnouncementSeverity; readonly className?: string }) {
  const Icon = severity === "CRITICAL" ? AlertOctagon : severity === "WARNING" ? AlertTriangle : Info;
  return <Icon size={16} className={className} aria-hidden />;
}

/**
 * Paket 2.9 (K2, §3.2): active announcements for the signed-in user. One
 * banner (several announcements → counter and arrows) and, for MODAL
 * announcements, a dialog that returns on navigation at most three times per
 * session. The dialog can always be closed (Esc) and never blocks work.
 *
 * Mounted inside the page container, which remounts on every navigation, so
 * "the next navigation" is simply the next mount.
 */
export function AnnouncementsHost() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: announcementQueryKeys.active,
    queryFn: getActiveAnnouncements,
    staleTime: 30_000,
    refetchInterval: pollMs,
    retry: false,
  });
  const announcements = useMemo(() => data?.announcements ?? [], [data]);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modal, setModal] = useState<ActiveAnnouncement | null>(null);
  const modalDecided = useRef(false);

  const current = announcements[Math.min(index, Math.max(0, announcements.length - 1))];

  useEffect(() => {
    if (index >= announcements.length && announcements.length > 0) setIndex(announcements.length - 1);
  }, [announcements.length, index]);

  useEffect(() => {
    setExpanded(false);
  }, [current?.id]);

  // One modal per mount (= per navigation), within the session budget.
  useEffect(() => {
    if (modalDecided.current || data === undefined) return;
    modalDecided.current = true;
    const store = sessionStore();
    const candidate = announcements.find(
      (item) => item.displayMode === "MODAL" && modalShowsLeft(store, item.id, item.version) > 0,
    );
    if (candidate !== undefined) {
      recordModalShown(store, candidate.id, candidate.version);
      setModal(candidate);
    }
  }, [announcements, data]);

  const removeLocally = (id: string) => {
    queryClient.setQueryData<ActiveAnnouncements>(announcementQueryKeys.active, (previous) =>
      previous === undefined ? previous : { ...previous, announcements: previous.announcements.filter((item) => item.id !== id) },
    );
  };

  const settle = async (item: ActiveAnnouncement) => {
    setBusyId(item.id);
    try {
      if (item.requiresAcknowledgement) {
        await acknowledgeAnnouncement(item.id);
        toast({ tone: "success", title: t("announcements.banner.acknowledged") });
      } else {
        await dismissAnnouncement(item.id);
      }
      removeLocally(item.id);
      if (modal?.id === item.id) setModal(null);
      void queryClient.invalidateQueries({ queryKey: announcementQueryKeys.archive });
    } catch (caught) {
      toast({ tone: "danger", title: t(mapAnnouncementError(caught) ?? mapApiError(caught)), error: caught });
      void queryClient.invalidateQueries({ queryKey: announcementQueryKeys.active });
    } finally {
      setBusyId(null);
    }
  };

  if (data === undefined || !data.enabled || current === undefined) {
    return <AnnouncementModal item={modal} busy={busyId !== null} onClose={() => setModal(null)} onAcknowledge={settle} />;
  }

  const tone = severityTone(current.severity);
  const classes = announcementToneClasses[tone];
  const bodyId = `announcement-body-${current.id}`;

  return (
    <>
      <section
        aria-label={t("announcements.banner.region")}
        className={cn("fade-in mb-4 rounded-lg border px-3.5 py-3 text-[12.5px] text-foreground", classes.frame)}
      >
        <div role={severityRole(current.severity)} className="flex items-start gap-2.5">
          <SeverityIcon severity={current.severity} className={cn("mt-0.5 shrink-0", classes.icon)} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-5">
              <span className="sr-only">{t(severityKeys[current.severity])}: </span>
              {current.title}
            </p>
            {current.serviceName ? (
              <p className="text-[11.5px] text-muted-foreground">{t("announcements.banner.service", { name: current.serviceName })}</p>
            ) : null}
          </div>
        </div>
        {expanded ? (
          <div id={bodyId} className="mt-2 pl-[26px]">
            <MarkdownView source={current.body} className="grid gap-2 text-[12.5px] leading-5" />
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-[26px]">
          <Button
            variant="ghost"
            size="xs"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={14} className={cn("transition-transform", expanded ? "rotate-180" : "")} aria-hidden />
            {expanded ? t("announcements.banner.less") : t("announcements.banner.more")}
          </Button>
          {current.requiresAcknowledgement ? (
            <Button size="xs" onClick={() => void settle(current)} disabled={busyId !== null}>
              {t("announcements.banner.acknowledge")}
            </Button>
          ) : (
            <Button variant="outline" size="xs" onClick={() => void settle(current)} disabled={busyId !== null}>
              <X size={14} aria-hidden />
              {t("announcements.banner.dismiss")}
            </Button>
          )}
          <Link to="/announcements" className="text-[12px] text-link underline-offset-4 hover:underline">
            {t("announcements.banner.all")}
          </Link>
          {announcements.length > 1 ? (
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={t("announcements.banner.previous")}
                disabled={index === 0}
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
              >
                <ChevronLeft size={14} aria-hidden />
              </Button>
              <span className="tnum text-[11.5px] text-muted-foreground" aria-live="polite">
                {t("announcements.banner.counter", { current: index + 1, total: announcements.length })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label={t("announcements.banner.next")}
                disabled={index >= announcements.length - 1}
                onClick={() => setIndex((value) => Math.min(announcements.length - 1, value + 1))}
              >
                <ChevronRight size={14} aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      </section>
      <AnnouncementModal item={modal} busy={busyId !== null} onClose={() => setModal(null)} onAcknowledge={settle} />
    </>
  );
}

function AnnouncementModal({
  item,
  busy,
  onClose,
  onAcknowledge,
}: {
  readonly item: ActiveAnnouncement | null;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onAcknowledge: (item: ActiveAnnouncement) => Promise<void>;
}) {
  const { t } = useTranslation();
  if (item === null) return null;
  const classes = announcementToneClasses[severityTone(item.severity)];
  return (
    <Modal open onOpenChange={(open) => (open ? undefined : onClose())}>
      <ModalContent className="max-w-lg">
        <div className="mb-3 flex items-start gap-2.5 pr-6">
          <span className={cn("mt-0.5 inline-flex rounded-md border p-1.5", classes.frame)}>
            <Megaphone size={16} className={classes.icon} aria-hidden />
          </span>
          <div className="min-w-0">
            <ModalTitle className="text-[14px] font-semibold leading-5 text-foreground">{item.title}</ModalTitle>
            <ModalDescription className="text-[12px] text-muted-foreground">
              {t(severityKeys[item.severity])}
              {item.serviceName ? ` · ${item.serviceName}` : ""}
            </ModalDescription>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          <MarkdownView source={item.body} className="grid gap-2 text-[12.5px] leading-5 text-foreground" />
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            {t("announcements.modal.later")}
          </Button>
          <Button onClick={() => void onAcknowledge(item)} disabled={busy}>
            {t("announcements.banner.acknowledge")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
