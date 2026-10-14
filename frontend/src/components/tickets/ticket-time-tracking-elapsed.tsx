import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function formatElapsedDuration(startedAt: string, now: number): string {
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) return "00:00:00";
  const totalSeconds = Math.max(0, Math.floor((now - startedAtMs) / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function TicketTimeTrackingElapsed({
  startedAt,
  ticketNumber,
}: {
  readonly startedAt: string;
  readonly ticketNumber: string;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  const duration = formatElapsedDuration(startedAt, now);
  return (
    <span
      className="font-mono text-[11px] tabular-nums text-muted-foreground"
      data-testid="time-active-elapsed"
      aria-label={t("tickets.timeTracking.indicatorLabel", {
        ticket: ticketNumber,
        elapsed: duration,
      })}
    >
      {duration}
    </span>
  );
}
