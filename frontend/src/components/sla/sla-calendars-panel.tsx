import { Timer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlaCalendarForm } from "@/components/sla/sla-calendar-form";
import { SlaChangeLogPanel } from "@/components/sla/sla-change-log-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { errorTextClassName } from "@/components/ui/control";
import { PanelSkeleton } from "@/components/ui/skeleton";
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
    <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
      <Card>
        <CardHeader title={t("sla.calendarsHeading")} />
        <div className="px-4 py-3.5">
          {isLoading ? (
            <PanelSkeleton className="mt-0" label={t("sla.calendarsHeading")} />
          ) : calendars.length === 0 ? (
            <EmptyState icon={<Timer size={18} />} title={t("sla.calendarsEmptyTitle")} body={t("sla.calendarsEmptyBody")} />
          ) : (
            <ul className="space-y-1.5">
              {calendars.map((calendar) => (
                <li key={calendar.id}>
                  <button
                    type="button"
                    className={`w-full rounded-md border px-3 py-2 text-left text-[12.5px] ${
                      calendar.id === selectedId
                        ? "border-primary/50 bg-primary/8"
                        : "border-border bg-surface hover:bg-elevated/40"
                    }`}
                    onClick={() => setSelectedId(calendar.id)}
                  >
                    <span className="font-medium">{calendar.name}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">{calendar.timezone}</span>
                    <Badge tone={calendar.isActive ? "success" : "neutral"} className="mt-1.5">
                      {calendar.isActive ? t("sla.active") : t("sla.inactive")}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button className="mt-3" variant="outline" size="sm" onClick={() => setSelectedId(null)}>
            {t("sla.newCalendar")}
          </Button>
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader
            title={selected ? selected.name : t("sla.newCalendar")}
            actions={
              selected ? (
                <div className="flex items-center gap-2">
                  <input
                    className="h-8 w-44 rounded-md border border-border bg-background/60 px-2.5 text-[12.5px]"
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
