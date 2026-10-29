import { formatDurationMinutes } from "@/lib/tickets/ticket-display";
import type { summarizeTimeByUser } from "@/lib/time-tracking/summarize-time-logs";

type TimeUserSummaryEntries = ReturnType<typeof summarizeTimeByUser>;

export function TicketTimeUserSummary({
  entries,
  nameOf,
}: {
  readonly entries: TimeUserSummaryEntries;
  readonly nameOf: (userId: string | null | undefined) => string;
}) {
  if (entries.length <= 1) return null;
  return (
    <p className="px-4 pb-2 text-[11.5px] text-muted-foreground" data-testid="time-per-user">
      {entries
        .map((entry) => `${nameOf(entry.userId)} ${formatDurationMinutes(entry.seconds)}`)
        .join(" · ")}
    </p>
  );
}
