import { useTranslation } from "react-i18next";
import { slaWeekdays } from "@/lib/sla/sla-form-defaults";
import { formatSlaDayHours, formatSlaHolidayDate } from "@/lib/sla/format-sla-week-hours";
import { cn } from "@/lib/utils";
import type { BusinessHoursCalendar } from "@/services/sla-api";

const WEEKDAY_SHORT_KEYS = {
  "1": "sla.weekdayMondayShort",
  "2": "sla.weekdayTuesdayShort",
  "3": "sla.weekdayWednesdayShort",
  "4": "sla.weekdayThursdayShort",
  "5": "sla.weekdayFridayShort",
  "6": "sla.weekdaySaturdayShort",
  "7": "sla.weekdaySundayShort",
} as const;

interface SlaCalendarWeekGridProperties {
  readonly calendar: BusinessHoursCalendar;
}

export function SlaCalendarWeekGrid({ calendar }: SlaCalendarWeekGridProperties) {
  const { t, i18n } = useTranslation();

  return (
    <div className="px-4 py-3.5">
      <div className="grid grid-cols-7 gap-1">
        {slaWeekdays.map((weekday) => {
          const hours = formatSlaDayHours(calendar.weeklyHours, weekday.key);
          return (
            <div key={weekday.key} className="text-center">
              <p className="text-[9.5px] text-muted/60">{t(WEEKDAY_SHORT_KEYS[weekday.key])}</p>
              <div
                className={cn(
                  "mt-1 flex h-9 items-center justify-center rounded-md border text-[10.5px] tnum",
                  hours
                    ? "border-success/30 bg-success/10 text-[#4ADE80]"
                    : "border-border/60 bg-background/40 text-muted/50",
                )}
              >
                {hours ?? "—"}
              </div>
            </div>
          );
        })}
      </div>
      {calendar.holidays.length > 0 ? (
        <div className="mt-3.5 border-t border-border/60 pt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted/70">
            {t("sla.holidaysPaused")}
          </p>
          <ul className="space-y-1">
            {calendar.holidays.map((holiday) => (
              <li
                key={`${holiday.date}-${holiday.name}`}
                className="flex items-center justify-between gap-2 text-[11.5px]"
              >
                <span className="text-text/85">{holiday.name}</span>
                <span className="tnum text-muted/70">
                  {formatSlaHolidayDate(holiday.date, i18n.language)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
