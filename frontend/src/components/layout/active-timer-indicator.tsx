import { Square, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { markActiveTimerChanged, useActiveTimer } from "@/lib/time-tracking/active-timer-store";
import { formatElapsed } from "@/lib/time-tracking/idle-policy";
import { stopTicketTimeLog } from "@/services/tickets-collaboration-api";

/** Package 1.3 (T10): the running timer, visible on every screen. */
export function ActiveTimerIndicator() {
  const { t } = useTranslation();
  const { timer } = useActiveTimer();
  const [now, setNow] = useState(() => Date.now());
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    if (timer === null) {
      return;
    }
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [timer]);

  if (timer === null) {
    return null;
  }
  const elapsed = formatElapsed(timer.startedAt, now);
  const label = t("tickets.timeTracking.indicatorLabel", {
    ticket: timer.ticketNumber,
    elapsed,
  });
  return (
    <div
      className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 py-0.5 pl-2.5 pr-0.5 text-[12px] text-primary"
      data-testid="active-timer-indicator"
    >
      <Timer size={13} strokeWidth={2} aria-hidden className="animate-pulse" />
      <Link
        to={`/tickets/${timer.ticketId}`}
        className="max-w-[180px] truncate font-medium hover:underline"
        title={timer.ticketTitle.length > 0 ? `${timer.ticketNumber} · ${timer.ticketTitle}` : timer.ticketNumber}
        aria-label={label}
      >
        {timer.ticketNumber}
      </Link>
      <span className="tnum font-mono" aria-hidden>
        {elapsed}
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6 rounded-full"
        disabled={isStopping}
        aria-label={t("tickets.detail.stopTimer")}
        title={t("tickets.detail.stopTimer")}
        onClick={() => {
          setIsStopping(true);
          void stopTicketTimeLog(timer.ticketId, timer.timeLogId)
            .catch(() => undefined)
            .finally(() => {
              setIsStopping(false);
              void markActiveTimerChanged();
            });
        }}
      >
        <Square size={11} fill="currentColor" />
      </Button>
    </div>
  );
}
