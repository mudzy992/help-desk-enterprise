import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { controlClassName, hintClassName } from "@/components/ui/control";
import {
  installWeekdays,
  type InstallWeekday,
  type InstallWeekdayRow,
} from "@/lib/install/install-weekly-hours";

/*
  Install wizard v2 (F4.4): the week the seeded calendar covers, day by day. The
  switch says „we work that day“, the two fields say when. A day the calendar has
  more than one interval for keeps the rest as they are and says so — the wizard
  edits the common case and never rewrites what it does not show.
*/
export function InstallBusinessHoursEditor({
  rows,
  isDisabled = false,
  onChange,
}: {
  readonly rows: readonly InstallWeekdayRow[];
  readonly isDisabled?: boolean;
  readonly onChange: (rows: readonly InstallWeekdayRow[]) => void;
}) {
  const { t } = useTranslation();
  const replace = (day: InstallWeekday, next: Partial<InstallWeekdayRow>) => {
    onChange(rows.map((row) => (row.day === day ? { ...row, ...next } : row)));
  };

  return (
    <div className="grid gap-2">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("install.slaReview.calendar.editorCaption")}</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="pb-1 font-medium">
              {t("install.slaReview.calendar.day")}
            </th>
            <th scope="col" className="pb-1 font-medium">
              {t("install.slaReview.calendar.from")}
            </th>
            <th scope="col" className="pb-1 font-medium">
              {t("install.slaReview.calendar.to")}
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              {t("install.slaReview.calendar.open")}
            </th>
          </tr>
        </thead>
        <tbody>
          {installWeekdays.map((day) => {
            const row = rows.find((candidate) => candidate.day === day);
            if (row === undefined) {
              return null;
            }
            return (
              <tr key={day} className="border-t border-border">
                <th scope="row" className="py-2 pr-2 text-left font-normal text-foreground">
                  {t(`install.slaReview.weekday.${day}`)}
                </th>
                <td className="py-2 pr-2">
                  <input
                    className={controlClassName}
                    type="time"
                    value={row.start}
                    disabled={isDisabled || !row.isOpen}
                    aria-label={t("install.slaReview.calendar.fromLabel", {
                      day: t(`install.slaReview.weekday.${day}`),
                    })}
                    onChange={(event) => replace(day, { start: event.target.value })}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    className={controlClassName}
                    type="time"
                    value={row.end}
                    disabled={isDisabled || !row.isOpen}
                    aria-label={t("install.slaReview.calendar.toLabel", {
                      day: t(`install.slaReview.weekday.${day}`),
                    })}
                    onChange={(event) => replace(day, { end: event.target.value })}
                  />
                </td>
                <td className="py-2 text-right">
                  <Switch
                    checked={row.isOpen}
                    disabled={isDisabled}
                    aria-label={t("install.slaReview.calendar.toggleDay", {
                      day: t(`install.slaReview.weekday.${day}`),
                    })}
                    onCheckedChange={(isOpen) => replace(day, { isOpen })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.some((row) => row.extraIntervals.length > 0) ? (
        <p className={hintClassName}>{t("install.slaReview.calendar.multipleIntervals")}</p>
      ) : null}
    </div>
  );
}
