import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/toast";
import {
  markActiveTimerChanged,
  readActiveTimerState,
  refreshActiveTimer,
  resetActiveTimer,
  setPausedTicket,
} from "@/lib/time-tracking/active-timer-store";
import {
  activityStorageKey,
  activityWriteThrottleMilliseconds,
  decideIdle,
  heartbeatIntervalMilliseconds,
} from "@/lib/time-tracking/idle-policy";
import { subscribeSocketEvent } from "@/lib/realtime/subscribe-socket-event";
import { acquireHelpdeskSocket, releaseHelpdeskSocket } from "@/services/helpdesk-socket";
import {
  heartbeatTicketTimeLog,
  startTicketTimeLog,
  stopTicketTimeLog,
} from "@/services/tickets-collaboration-api";

const tickMilliseconds = 15_000;
const activityEvents = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

function readSharedActivity(): number {
  const raw = window.localStorage.getItem(activityStorageKey);
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Package 1.3 (T3/T10): runs once in the application shell for staff users.
 * Tracks activity, sends heartbeats, pauses an idle timer at the moment of the
 * last activity and — when the policy allows — resumes it on return.
 */
export function ActiveTimerHost({ accessToken }: { readonly accessToken: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    let lastActivityAt = Date.now();
    let lastWrite = 0;
    let hiddenSince: number | null = document.hidden ? Date.now() : null;
    let lastHeartbeat = 0;
    let busy = false;
    window.localStorage.setItem(activityStorageKey, String(lastActivityAt));

    const resumeIfPaused = async () => {
      const current = readActiveTimerState();
      const paused = current.pausedTicket;
      if (paused === null || current.timer !== null || busy) {
        return;
      }
      setPausedTicket(null);
      if (current.policy?.autoResume !== true) {
        return;
      }
      busy = true;
      try {
        await startTicketTimeLog(paused.ticketId);
        toastRef.current({
          tone: "info",
          title: tRef.current("tickets.timeTracking.resumedTitle"),
          description: tRef.current("tickets.timeTracking.resumedBody", {
            ticket: paused.ticketNumber,
          }),
        });
      } catch {
        // The ticket may have been closed meanwhile; the pause notice stands.
      } finally {
        busy = false;
        await markActiveTimerChanged();
      }
    };

    const onActivity = () => {
      const now = Date.now();
      lastActivityAt = now;
      if (now - lastWrite > activityWriteThrottleMilliseconds) {
        lastWrite = now;
        window.localStorage.setItem(activityStorageKey, String(now));
      }
      void resumeIfPaused();
    };

    const onVisibility = () => {
      if (document.hidden) {
        hiddenSince = Date.now();
        return;
      }
      hiddenSince = null;
      void refreshActiveTimer().then(onActivity);
    };

    const tick = async () => {
      const current = readActiveTimerState();
      const timer = current.timer;
      if (timer === null || current.policy === null || busy) {
        return;
      }
      const now = Date.now();
      const decision = decideIdle({
        now,
        lastActivityAt: Math.max(lastActivityAt, readSharedActivity()),
        hiddenSince,
        idleMinutes: current.policy.idleAutoPauseMinutes,
      });
      busy = true;
      try {
        if (decision.kind === "idle") {
          await stopTicketTimeLog(timer.ticketId, timer.timeLogId, {
            reason: "AUTO_IDLE",
            endedAt: new Date(Math.max(decision.endedAt, new Date(timer.startedAt).getTime())).toISOString(),
          }).catch(() => undefined);
          setPausedTicket({ ticketId: timer.ticketId, ticketNumber: timer.ticketNumber });
          toastRef.current({
            tone: "warning",
            duration: 0,
            title: tRef.current("tickets.timeTracking.pausedTitle"),
            description: tRef.current("tickets.timeTracking.pausedBody", {
              ticket: timer.ticketNumber,
              minutes: current.policy.idleAutoPauseMinutes,
            }),
          });
          await markActiveTimerChanged();
          return;
        }
        if (decision.sendHeartbeat && now - lastHeartbeat >= heartbeatIntervalMilliseconds) {
          lastHeartbeat = now;
          await heartbeatTicketTimeLog(timer.ticketId, timer.timeLogId).catch(async () => {
            // Stopped elsewhere (sweep, status change, another tab): re-read.
            await markActiveTimerChanged();
          });
        }
      } finally {
        busy = false;
      }
    };

    const socket = acquireHelpdeskSocket(accessToken);
    const stopSocket = subscribeSocketEvent(socket, "time.timer.changed", () => {
      void markActiveTimerChanged();
    });
    for (const name of activityEvents) {
      window.addEventListener(name, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => void tick(), tickMilliseconds);
    void refreshActiveTimer();

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const name of activityEvents) {
        window.removeEventListener(name, onActivity);
      }
      stopSocket();
      releaseHelpdeskSocket();
      resetActiveTimer();
    };
  }, [accessToken]);

  return null;
}
