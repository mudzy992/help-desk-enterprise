import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import { cn } from "@/lib/utils";

interface RelativeTimeProperties {
  readonly value: string;
  readonly locale: string;
  readonly className?: string;
}

export function RelativeTime({ value, locale, className }: RelativeTimeProperties) {
  const { t } = useTranslation();
  return (
    <time
      dateTime={value}
      title={formatTicketTimestamp(value, locale)}
      className={cn("tnum", className)}
    >
      {formatRelativeTime(value, t, locale)}
    </time>
  );
}
