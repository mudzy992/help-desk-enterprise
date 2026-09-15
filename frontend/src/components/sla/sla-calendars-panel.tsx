import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SlaAdminListColumn,
  SlaAdminSelectorCard,
} from "@/components/sla/sla-admin-selector";
import { SlaCalendarForm } from "@/components/sla/sla-calendar-form";
import { SlaCalendarWeekGrid } from "@/components/sla/sla-calendar-week-grid";
import { SlaChangeLogPanel } from "@/components/sla/sla-change-log-panel";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { controlClassName, errorTextClassName } from "@/components/ui/control";
import { mapSlaError, type SlaErrorKey } from "@/lib/sla/map-sla-error";
import {
  createSlaCalendar,
  deleteSlaCalendar,
  listSlaCalendarChanges,
  listSlaCalendars,
  updateSlaCalendar,
  type BusinessHoursCalendar,
  type CalendarWriteInput,
  type SlaChangeLogEntry,
} from "@/services/sla-api";

export function SlaCalendarsPanel() {
  const { t } = useTranslation();
  const [calendars, setCalendars] = useState<readonly BusinessHoursCalendar[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [changes, setChanges] = useState<readonly SlaChangeLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<SlaErrorKey | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const selected = calendars.find((calendar) => calendar.id === selectedId);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      const items = await listSlaCalendars();
      setCalendars(items);
      const nextId = selectedId ?? items[0]?.id ?? null;
      setSelectedId(nextId);
      setChanges(nextId === null ? [] : await listSlaCalendarChanges(nextId));
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (input: CalendarWriteInput & { readonly key: string }) => {
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      if (selected === undefined) {
        const created = await createSlaCalendar(input);
        setSelectedId(created.id);
      } else {
        await updateSlaCalendar(selected.id, input);
      }
      await load();
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const remove = async () => {
    if (selected === undefined || deleteReason.trim().length === 0) {
      return;
    }
    setIsSubmitting(true);
    try {
      await deleteSlaCalendar(selected.id, deleteReason.trim());
      setDeleteReason("");
      setSelectedId(null);
      await load();
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
      <SlaAdminListColumn
        isLoading={isLoading}
        isEmpty={calendars.length === 0}
        loadingLabel={t("sla.calendarsHeading")}
        emptyTitle={t("sla.calendarsEmptyTitle")}
        emptyBody={t("sla.calendarsEmptyBody")}
        newLabel={t("sla.newCalendar")}
        onNew={() => setSelectedId(null)}
      >
        {calendars.map((calendar) => (
          <SlaAdminSelectorCard
            key={calendar.id}
            isSelected={calendar.id === selectedId}
            onSelect={() => setSelectedId(calendar.id)}
            code={calendar.key}
            title={calendar.name}
            metaIcon={CalendarDays}
            metaLabel={calendar.timezone}
            badgeLabel={calendar.isActive ? t("sla.active") : t("sla.inactive")}
            badgeTone={calendar.isActive ? "success" : "neutral"}
          />
        ))}
      </SlaAdminListColumn>
      <div className="space-y-4">
        {selected ? (
          <Card>
            <CardHeader
              title={selected.name}
              subtitle={`${t("sla.weeklyHours")} · ${selected.timezone}`}
            />
            <SlaCalendarWeekGrid calendar={selected} />
          </Card>
        ) : null}
        <Card>
          <CardHeader
            title={selected ? selected.name : t("sla.newCalendar")}
            actions={
              selected ? (
                <div className="flex items-center gap-2">
                  <input
                    className={`${controlClassName} h-8 w-44`}
                    value={deleteReason}
                    onChange={(event) => setDeleteReason(event.target.value)}
                    placeholder={t("sla.reason")}
                  />
                  <Button variant="destructive" size="xs" onClick={() => void remove()}>
                    {t("sla.delete")}
                  </Button>
                </div>
              ) : null
            }
          />
          <div className="px-4 py-3.5">
            {errorKey && isLoading ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
            <SlaCalendarForm
              key={selected?.id ?? "new"}
              calendar={selected}
              errorKey={errorKey}
              isSubmitting={isSubmitting}
              onSubmit={save}
            />
          </div>
        </Card>
        {selected ? (
          <Card>
            <CardHeader title={t("sla.changeLogHeading")} subtitle={t("sla.changeLogHint")} />
            <div className="px-4 py-3.5">
              <SlaChangeLogPanel entries={changes} />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
