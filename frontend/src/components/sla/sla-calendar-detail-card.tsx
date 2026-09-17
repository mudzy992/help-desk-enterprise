import { useTranslation } from "react-i18next";
import { SlaCalendarWeekGrid } from "@/components/sla/sla-calendar-week-grid";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { BusinessHoursCalendar } from "@/services/sla-types";

interface SlaCalendarDetailCardProperties {
  readonly calendar: BusinessHoursCalendar | undefined;
}

export function SlaCalendarDetailCard({ calendar }: SlaCalendarDetailCardProperties) {
  const { t } = useTranslation();

  if (calendar === undefined) {
    return (
      <Card>
        <CardHeader title={t("sla.calendar")} />
        <div className="px-4 py-3.5">
          <EmptyState
            title={t("sla.calendarsEmptyTitle")}
            body={t("sla.calendarsEmptyBody")}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={calendar.name}
        subtitle={`${t("sla.weeklyHours")} · ${calendar.timezone}`}
      />
      <SlaCalendarWeekGrid calendar={calendar} />
    </Card>
  );
}
