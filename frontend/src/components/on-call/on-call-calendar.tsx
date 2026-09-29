import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatOnCallClock, type OnCallDay } from "@/lib/on-call/on-call-view";

interface OnCallCalendarProperties {
  readonly days: readonly OnCallDay[];
  readonly timeZone: string;
  readonly currentUserId: string | null;
}

/**
 * Paket 2.9 (K3, §4.4): four weeks as a CSS grid of days. Each day is a list
 * item with a full text label, so screen readers get the same information as
 * the grid (who, from when) without relying on position or colour.
 */
export function OnCallCalendar({ days, timeZone, currentUserId }: OnCallCalendarProperties) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-GB" : "bs-BA";
  const weekdayFormat = new Intl.DateTimeFormat(locale, { timeZone, weekday: "short" });
  const dateFormat = new Intl.DateTimeFormat(locale, { timeZone, day: "2-digit", month: "2-digit" });
  const longFormat = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", day: "numeric", month: "long" });

  return (
    <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-7" aria-label={t("onCall.calendar.label")} data-testid="on-call-calendar">
      {days.map((day) => (
        <li
          key={day.key}
          className={cn(
            "flex min-h-[84px] flex-col gap-1 rounded-md border border-border/70 bg-background/40 p-2",
            day.isToday && "border-primary/60 bg-primary/6",
          )}
          aria-current={day.isToday ? "date" : undefined}
        >
          <p className="flex items-baseline justify-between gap-1 text-[11.5px] text-muted-foreground">
            <span className="sr-only">{longFormat.format(day.date)}</span>
            <span aria-hidden="true" className="font-medium uppercase">
              {weekdayFormat.format(day.date)}
            </span>
            <span aria-hidden="true" className="tabular-nums">
              {dateFormat.format(day.date)}
            </span>
          </p>
          <ul className="grid gap-1">
            {day.entries.map(({ segment, startsHere }) => {
              const mine = currentUserId !== null && segment.person?.userId === currentUserId;
              const name = segment.person?.displayName ?? t("onCall.nobody");
              const since = startsHere ? formatOnCallClock(segment.startsAt, i18n.language, timeZone) : null;
              return (
                <li
                  key={`${segment.startsAt}-${segment.person?.userId ?? "none"}`}
                  className={cn(
                    "rounded px-1.5 py-1 text-[11.5px] leading-4",
                    segment.person === null
                      ? "border border-dashed border-warning/60 bg-warning/10 text-warning"
                      : segment.source === "override"
                        ? "bg-info/10 text-foreground"
                        : "bg-surface-hover text-foreground",
                    mine && "border border-primary/50 font-semibold",
                  )}
                >
                  {since ? <span className="tabular-nums text-muted-foreground">{since} </span> : null}
                  <span>{name}</span>
                  {segment.source === "override" ? <span className="sr-only"> ({t("onCall.source.override")})</span> : null}
                  {segment.person !== null && !segment.person.isAvailable ? (
                    <span className="block text-[11px] text-warning">{t("onCall.unavailable")}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
