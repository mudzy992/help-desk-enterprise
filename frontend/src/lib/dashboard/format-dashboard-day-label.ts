import { dateTimeFormatter } from "@/lib/date-time-formatter";

const dayLabelFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(language: string): Intl.DateTimeFormat {
  const cached = dayLabelFormatters.get(language);
  if (cached !== undefined) return cached;
  const formatter = dateTimeFormatter(language, { day: "2-digit", month: "2-digit" });
  dayLabelFormatters.set(language, formatter);
  return formatter;
}

export function formatDashboardDayLabel(date: Date, language: string): string {
  const parts = formatterFor(language).formatToParts(date);
  const day = (parts.find((part) => part.type === "day")?.value ?? String(date.getDate())).padStart(
    2,
    "0",
  );
  const month = (
    parts.find((part) => part.type === "month")?.value ?? String(date.getMonth() + 1)
  ).padStart(2, "0");
  return `${day}. ${month}`;
}
