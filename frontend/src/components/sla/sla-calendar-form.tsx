import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  controlClassName,
  errorTextClassName,
  labelClassName,
} from "@/components/ui/control";
import { Switch } from "@/components/ui/switch";
import { defaultWeeklyHours, slaTimezoneOptions, slaWeekdays } from "@/lib/sla/sla-form-defaults";
import type { BusinessHoursCalendar, CalendarWriteInput, WeeklyHours } from "@/services/sla-api";

interface SlaCalendarFormProperties {
  readonly calendar?: BusinessHoursCalendar;
  readonly errorKey: string | null;
  readonly isSubmitting: boolean;
  readonly onSubmit: (input: CalendarWriteInput & { readonly key: string }) => Promise<void>;
}

export function SlaCalendarForm({
  calendar,
  errorKey,
  isSubmitting,
  onSubmit,
}: SlaCalendarFormProperties) {
  const { t } = useTranslation();
  const [key, setKey] = useState(calendar?.key ?? "BH_STANDARD");
  const [name, setName] = useState(calendar?.name ?? "");
  const [timezone, setTimezone] = useState(calendar?.timezone ?? "Europe/Sarajevo");
  const [isActive, setIsActive] = useState(calendar?.isActive ?? true);
  const [reason, setReason] = useState("");
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHours>(
    calendar?.weeklyHours ?? defaultWeeklyHours,
  );
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidays, setHolidays] = useState(calendar?.holidays ?? []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({
      key,
      name,
      timezone,
      weeklyHours,
      holidays: holidays.map((holiday) => ({ date: holiday.date, name: holiday.name })),
      isActive,
      reason,
    });
    setReason("");
  };

  return (
    <form className="grid max-w-3xl gap-3" onSubmit={submit}>
      {calendar === undefined ? (
        <label className={labelClassName}>
          {t("sla.key")}
          <input className={controlClassName} value={key} onChange={(event) => setKey(event.target.value)} required />
        </label>
      ) : null}
      <label className={labelClassName}>
        {t("sla.name")}
        <input className={controlClassName} value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label className={labelClassName}>
        {t("sla.timezone")}
        <select
          className={controlClassName}
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          required
        >
          {slaTimezoneOptions.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
          {timezone.length > 0 &&
          !(slaTimezoneOptions as readonly string[]).includes(timezone) ? (
            <option value={timezone}>{timezone}</option>
          ) : null}
        </select>
      </label>
      <div className="grid gap-2">
        <p className={labelClassName}>{t("sla.weeklyHours")}</p>
        {slaWeekdays.map((weekday) => {
          const interval = weeklyHours[weekday.key]?.[0];
          return (
            <label key={weekday.key} className="grid grid-cols-[140px_1fr_1fr] items-center gap-2 text-[12.5px]">
              <span>{t(weekday.labelKey)}</span>
              <input
                className={controlClassName}
                type="time"
                value={interval?.start ?? ""}
                onChange={(event) =>
                  setWeeklyHours(updateDay(weeklyHours, weekday.key, event.target.value, interval?.end ?? "16:00"))
                }
              />
              <input
                className={controlClassName}
                type="time"
                value={interval?.end ?? ""}
                onChange={(event) =>
                  setWeeklyHours(updateDay(weeklyHours, weekday.key, interval?.start ?? "08:00", event.target.value))
                }
              />
            </label>
          );
        })}
      </div>
      <div className="grid gap-2">
        <p className={labelClassName}>{t("sla.holidays")}</p>
        <div className="flex flex-wrap gap-2">
          <input className={`${controlClassName} max-w-[160px]`} type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} />
          <input className={`${controlClassName} max-w-[220px]`} value={holidayName} onChange={(event) => setHolidayName(event.target.value)} placeholder={t("sla.holidayName")} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (holidayDate.length === 0 || holidayName.trim().length === 0) {
                return;
              }
              setHolidays([...holidays, { date: holidayDate, name: holidayName.trim() }]);
              setHolidayDate("");
              setHolidayName("");
            }}
          >
            {t("sla.addHoliday")}
          </Button>
        </div>
        <ul className="space-y-1 text-[12.5px]">
          {holidays.map((holiday) => (
            <li key={`${holiday.date}-${holiday.name}`} className="flex items-center justify-between gap-2">
              <span>{holiday.date} · {holiday.name}</span>
              <Button type="button" variant="ghost" size="xs" onClick={() => setHolidays(holidays.filter((item) => item !== holiday))}>
                {t("sla.remove")}
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <label className="flex items-center gap-2 text-[12.5px] font-medium">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        {t("sla.active")}
      </label>
      <label className={labelClassName}>
        {t("sla.reason")}
        <input className={controlClassName} value={reason} onChange={(event) => setReason(event.target.value)} required />
      </label>
      {errorKey ? <p className={errorTextClassName}>{t(errorKey as never)}</p> : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("sla.saving") : calendar ? t("sla.saveCalendar") : t("sla.createCalendar")}
        </Button>
      </div>
    </form>
  );
}

function updateDay(
  weeklyHours: WeeklyHours,
  weekday: string,
  start: string,
  end: string,
): WeeklyHours {
  if (start.length === 0 || end.length === 0) {
    const next = { ...weeklyHours };
    delete next[weekday];
    return next;
  }
  return { ...weeklyHours, [weekday]: [{ start, end }] };
}
