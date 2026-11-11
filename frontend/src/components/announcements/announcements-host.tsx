import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  AlertOctagon,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Megaphone,
  X,
} from "lucide-react";
import { MarkdownView } from "@/components/privacy/markdown-view";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalTitle,
} from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  announcementSeverityKeys,
  announcementToneClasses,
  mapAnnouncementError,
  modalShowsLeft,
  recordModalShown,
  severityRole,
  severityTone,
} from "@/lib/announcements/announcement-view";
import { useOperationGuard } from "@/lib/async/use-operation-guard";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import { ticketSocketEvents } from "@/services/ticket-socket";
import { mapApiError, readApiRequestId } from "@/lib/map-api-error";
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

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function SeverityIcon({
  severity,
  className,
}: {
  readonly severity: AnnouncementSeverity;
  readonly className?: string;
}) {
  const Icon =
    severity === "CRITICAL" ? AlertOctagon : severity === "WARNING" ? AlertTriangle : Info;
  return <Icon size={16} className={className} aria-hidden />;
}

/**
 * Active announcements for the signed-in user. A session budget prevents
 * modal announcements from repeatedly interrupting work across navigation.
 */
export function AnnouncementsHost() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const operationGuard = useOperationGuard();
  const queryClient = useQueryClient();
  const { data, error, isFetching, refetch } = useQuery({
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
  const decidedModals = useRef(new Set<string>());

  const current = announcements[Math.min(index, Math.max(0, announcements.length - 1))];

  useEffect(() => {
    if (index >= announcements.length && announcements.length > 0)
      setIndex(announcements.length - 1);
  }, [announcements.length, index]);

  useEffect(() => {
    setExpanded(false);
  }, [current?.id]);

  // BA-announcements-20: a modal is decided once per mount for the initial list,
  // and again whenever a NEW modal announcement arrives (realtime refetch or
  // poll) — each announcement id is decided at most once per mount, so a
  // settled or dismissed modal never reopens.
  useEffect(() => {
    if (data === undefined) return;
    const store = sessionStore();
    const candidate = announcements.find(
      (item) =>
        item.displayMode === "MODAL" &&
        !decidedModals.current.has(item.id) &&
        modalShowsLeft(store, item.id, item.version) > 0,
    );
    if (!modalDecided.current) modalDecided.current = true;
    for (const item of announcements) {
      if (item.displayMode === "MODAL") decidedModals.current.add(item.id);
    }
    if (candidate !== undefined) {
      recordModalShown(store, candidate.id, candidate.version);
      setModal(candidate);
    }
  }, [announcements, data]);

  // BA-announcements-20: the worker pushes a content-free announcement.changed
  // signal to every recipient's room; refetch the active list with our own
  // authorization instead of waiting up to 60 s for the poll.
  useEffect(() => {
    const socket = acquireHelpdeskSocket();
    const stop = subscribeSocketEvent(socket, ticketSocketEvents.announcementChanged, () => {
      void queryClient.invalidateQueries({ queryKey: announcementQueryKeys.active });
    });
    return () => {
      stop();
      releaseHelpdeskSocket();
    };
  }, [queryClient]);

  const removeLocally = (id: string) => {
    queryClient.setQueryData<ActiveAnnouncements>(announcementQueryKeys.active, (previous) =>
      previous === undefined
        ? previous
        : { ...previous, announcements: previous.announcements.filter((item) => item.id !== id) },
    );
  };

  const settle = async (item: ActiveAnnouncement) => {
    await operationGuard.run(`settle:${item.id}`, async () => {
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
        toast({
          tone: "danger",
          title: t(mapAnnouncementError(caught) ?? mapApiError(caught)),
          error: caught,
        });
        void queryClient.invalidateQueries({ queryKey: announcementQueryKeys.active });
      } finally {
        setBusyId(null);
      }
    });
  };

  if (error !== null && data === undefined) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-danger/30 bg-danger/10 px-4 py-2">
        <ApiErrorText
          messageKey={mapAnnouncementError(error) ?? mapApiError(error)}
          requestId={readApiRequestId(error)}
        />
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {t("ui.retry")}
        </Button>
      </div>
    );
  }

  if (data === undefined || !data.enabled || current === undefined) {
    return (
      <AnnouncementModal
        item={modal}
        busy={busyId !== null}
        onClose={() => setModal(null)}
        onAcknowledge={settle}
      />
    );
  }

  const tone = severityTone(current.severity);
  const classes = announcementToneClasses[tone];
  const bodyId = `announcement-body-${current.id}`;

  return (
    <>
      {error === null ? null : (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
          <ApiErrorText
            messageKey={mapAnnouncementError(error) ?? mapApiError(error)}
            requestId={readApiRequestId(error)}
          />
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {t("ui.retry")}
          </Button>
        </div>
      )}
      <section
        aria-label={t("announcements.banner.region")}
        className={cn(
          "fade-in mb-4 rounded-lg border px-3.5 py-3 text-[12.5px] text-foreground",
          classes.frame,
        )}
      >
        <div role={severityRole(current.severity)} className="flex items-start gap-2.5">
          <SeverityIcon
            severity={current.severity}
            className={cn("mt-0.5 shrink-0", classes.icon)}
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-5">
              <span className="sr-only">{t(announcementSeverityKeys[current.severity])}: </span>
              {current.title}
            </p>
            {current.serviceName ? (
              <p className="text-[11.5px] text-muted-foreground">
                {t("announcements.banner.service", { name: current.serviceName })}
              </p>
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
            <ChevronDown
              size={14}
              className={cn("transition-transform", expanded ? "rotate-180" : "")}
              aria-hidden
            />
            {expanded ? t("announcements.banner.less") : t("announcements.banner.more")}
          </Button>
          {current.requiresAcknowledgement ? (
            <Button size="xs" onClick={() => void settle(current)} disabled={busyId !== null}>
              {t("announcements.banner.acknowledge")}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="xs"
              onClick={() => void settle(current)}
              disabled={busyId !== null}
            >
              <X size={14} aria-hidden />
              {t("announcements.banner.dismiss")}
            </Button>
          )}
          <Link
            to="/announcements"
            className="text-[12px] text-link underline-offset-4 hover:underline"
          >
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
                {t("announcements.banner.counter", {
                  current: index + 1,
                  total: announcements.length,
                })}
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
      <AnnouncementModal
        item={modal}
        busy={busyId !== null}
        onClose={() => setModal(null)}
        onAcknowledge={settle}
      />
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
            <ModalTitle className="text-[14px] font-semibold leading-5 text-foreground">
              {item.title}
            </ModalTitle>
            <ModalDescription className="text-[12px] text-muted-foreground">
              {t(announcementSeverityKeys[item.severity])}
              {item.serviceName ? ` · ${item.serviceName}` : ""}
            </ModalDescription>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          <MarkdownView
            source={item.body}
            className="grid gap-2 text-[12.5px] leading-5 text-foreground"
          />
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
