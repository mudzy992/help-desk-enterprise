import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Snowflake } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { buildMonthGrid, dayKey, freezeOn, isSameDay, monthOf, overlapsDay, shiftMonth, type CalendarMonth } from "@/lib/changes/change-calendar";
import { changeRiskKeys, changeRiskTone, changeStatusKeys, formatChangeWindow, mapChangeError } from "@/lib/changes/change-view";
import { mapApiError } from "@/lib/map-api-error";
import { changeExtraKeys, getChangeCalendar, type ChangeCalendar as CalendarData } from "@/services/changes-api";

const cellItemMax = 3;

type DayItems = {
  readonly changes: CalendarData["changes"];
  readonly downtime: CalendarData["downtime"];
  readonly freeze: CalendarData["freezePeriods"][number] | null;
};

/**
 * Paket 3.4 (§17, §20): month calendar of changes, downtime windows (not
 * created by a change) and freeze periods. A table on wide screens, a list by
 * day on narrow ones; risk is always written out, never colour alone.
 */
export function ChangeCalendar() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("bs") ? "bs-BA" : "en-GB";
  const [month, setMonth] = useState<CalendarMonth>(() => monthOf(new Date()));
  const [today] = useState(() => new Date());
  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const from = grid.from.toISOString();
  const to = grid.to.toISOString();
  const query = useQuery({ queryKey: changeExtraKeys.calendar(from, to), queryFn: () => getChangeCalendar(from, to), retry: false });

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(month.year, month.month, 1));
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const dayFormat = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const weekdays = grid.weeks[0]?.map((day) => ({ short: weekdayFormat.format(day), key: dayKey(day) })) ?? [];

  const itemsFor = (day: Date): DayItems => {
    const data = query.data;
    if (data === undefined) return { changes: [], downtime: [], freeze: null };
    return {
      changes: data.changes.filter((item) => overlapsDay(day, item.plannedStart, item.plannedEnd)),
      // Windows created by a change are shown through the change itself.
      downtime: data.downtime.filter((item) => item.changeRequestId === null && overlapsDay(day, item.startsAt, item.endsAt)),
      freeze: freezeOn(day, data.freezePeriods),
    };
  };

  const navigation = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[14px] font-semibold capitalize text-foreground" aria-live="polite">
        {monthLabel}
      </h2>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" onClick={() => setMonth((value) => shiftMonth(value, -1))} aria-label={t("changes.calendar.previous")}>
          <ChevronLeft size={14} aria-hidden="true" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMonth(monthOf(new Date()))}>
          {t("changes.calendar.today")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMonth((value) => shiftMonth(value, 1))} aria-label={t("changes.calendar.next")}>
          <ChevronRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  if (query.isLoading) {
    return (
      <div className="grid gap-3">
        {navigation}
        <PanelSkeleton label={t("ui.loading")} />
      </div>
    );
  }
  if (query.error || query.data === undefined) {
    return (
      <div className="grid gap-3">
        {navigation}
        <p role="alert" className={errorTextClassName}>
          {t(mapChangeError(query.error) ?? mapApiError(query.error))}
        </p>
      </div>
    );
  }

  const days = grid.weeks.flat();
  const listDays = days.filter((day) => day.getMonth() === month.month).map((day) => ({ day, items: itemsFor(day) }));
  const busyDays = listDays.filter(({ items }) => items.changes.length > 0 || items.downtime.length > 0 || items.freeze !== null);

  const changeLink = (item: CalendarData["changes"][number], compact: boolean) => (
    <Link
      key={item.id}
      to={`/changes/${item.id}`}
      className="block rounded-sm px-1 py-0.5 text-[11.5px] text-foreground hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
      title={`${item.number} · ${item.title} · ${t(changeStatusKeys[item.status])} · ${formatChangeWindow(item.plannedStart, item.plannedEnd, i18n.language)}`}
    >
      <span className="flex items-center gap-1">
        <Badge tone={changeRiskTone(item.risk)}>{t(changeRiskKeys[item.risk])}</Badge>
        <span className="tnum font-medium">{item.number}</span>
      </span>
      {compact ? <span className="sr-only">{item.title}</span> : <span className="block truncate text-muted-foreground">{item.title}</span>}
    </Link>
  );

  return (
    <div className="grid gap-3" data-testid="change-calendar">
      {navigation}
      {query.data.truncated ? <p className={hintClassName}>{t("changes.calendar.truncated")}</p> : null}
      <p className={hintClassName}>{t("changes.calendar.legend")}</p>

      <Card className="hidden overflow-hidden p-0 md:block">
        <table className="w-full table-fixed text-[12px]">
          <caption className="sr-only">{t("changes.calendar.caption", { month: monthLabel })}</caption>
          <thead>
            <tr className="border-b border-border/70 bg-muted/40">
              {weekdays.map((weekday) => (
                <th key={weekday.key} scope="col" className="px-2 py-1.5 text-left text-[11.5px] font-medium capitalize text-muted-foreground">
                  {weekday.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.weeks.map((week) => (
              <tr key={dayKey(week[0]!)} className="border-b border-border/60 last:border-b-0">
                {week.map((day) => {
                  const items = itemsFor(day);
                  const outside = day.getMonth() !== month.month;
                  const count = items.changes.length + items.downtime.length;
                  const label = [
                    dayFormat.format(day),
                    t("changes.calendar.cellChanges", { count: items.changes.length }),
                    items.downtime.length > 0 ? t("changes.calendar.cellDowntime", { count: items.downtime.length }) : null,
                    items.freeze ? t("changes.calendar.cellFreeze", { label: items.freeze.label || t("changes.conflicts.freezeUnnamed") }) : null,
                  ]
                    .filter(Boolean)
                    .join(", ");
                  const visibleChanges = items.changes.slice(0, cellItemMax);
                  const visibleDowntime = items.downtime.slice(0, Math.max(0, cellItemMax - visibleChanges.length));
                  const hidden = count - visibleChanges.length - visibleDowntime.length;
                  return (
                    <td
                      key={dayKey(day)}
                      aria-label={label}
                      className={`h-28 align-top border-l border-border/60 first:border-l-0 px-1 py-1 ${items.freeze ? "bg-info/10" : ""} ${outside ? "bg-muted/30" : ""}`}
                    >
                      <div className="mb-0.5 flex items-center justify-between gap-1 px-1">
                        <span
                          className={`tnum text-[11.5px] ${isSameDay(day, today) ? "rounded-full bg-primary px-1.5 font-semibold text-primary-foreground" : outside ? "text-muted-foreground" : "text-foreground"}`}
                          aria-hidden="true"
                        >
                          {day.getDate()}
                        </span>
                        {items.freeze ? <Snowflake size={12} className="text-info" aria-hidden="true" /> : null}
                      </div>
                      {visibleChanges.map((item) => changeLink(item, true))}
                      {visibleDowntime.map((item) => (
                        <span key={item.id} className="block truncate px-1 py-0.5 text-[11.5px] text-muted-foreground" title={item.message ?? undefined}>
                          {t("changes.calendar.downtimeItem", { service: item.service.name })}
                        </span>
                      ))}
                      {hidden > 0 ? <span className="block px-1 text-[11px] text-muted-foreground">{t("changes.calendar.more", { count: hidden })}</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-2 md:hidden">
        {busyDays.length === 0 ? (
          <EmptyState icon={<CalendarDays size={18} />} title={t("changes.calendar.emptyTitle")} body={t("changes.calendar.emptyBody")} />
        ) : (
          busyDays.map(({ day, items }) => (
            <Card key={dayKey(day)} className="p-0">
              <h3 className="border-b border-border/60 px-3 py-1.5 text-[12.5px] font-medium capitalize text-foreground">{dayFormat.format(day)}</h3>
              <div className="grid gap-1 px-2 py-2">
                {items.freeze ? (
                  <p className="flex items-center gap-1.5 px-1 text-[12px] text-foreground">
                    <Snowflake size={12} className="text-info" aria-hidden="true" />
                    {t("changes.calendar.cellFreeze", { label: items.freeze.label || t("changes.conflicts.freezeUnnamed") })}
                  </p>
                ) : null}
                {items.changes.map((item) => changeLink(item, false))}
                {items.downtime.map((item) => (
                  <p key={item.id} className="px-1 text-[12px] text-muted-foreground">
                    {t("changes.calendar.downtimeItem", { service: item.service.name })} · {formatChangeWindow(item.startsAt, item.endsAt, i18n.language)}
                  </p>
                ))}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
