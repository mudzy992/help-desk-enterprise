import { formatRelativeTicketTime, formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import { cn } from "@/lib/utils";

interface RelativeTimeProperties {
  readonly value: string;
  readonly locale: string;
  readonly className?: string;
}

export function RelativeTime({ value, locale, className }: RelativeTimeProperties) {
  return (
    <time
      dateTime={value}
      title={formatTicketTimestamp(value, locale)}
      className={cn("tnum", className)}
    >
      {formatRelativeTicketTime(value, locale)}
    </time>
  );
}
