import { useTranslation } from "react-i18next";
import { dateTimeFormatter } from "@/lib/date-time-formatter";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { cn } from "@/lib/utils";

interface RelativeTimeProperties {
  readonly value: string;
  readonly locale: string;
  readonly className?: string;
}

function formatTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormatter(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function RelativeTime({ value, locale, className }: RelativeTimeProperties) {
  const { t } = useTranslation();
  return (
    <time dateTime={value} title={formatTimestamp(value, locale)} className={cn("tnum", className)}>
      {formatRelativeTime(value, t, locale)}
    </time>
  );
}
