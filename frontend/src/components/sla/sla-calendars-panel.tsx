import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SlaAdminListColumn, SlaAdminSelectorCard } from "@/components/sla/sla-admin-selector";
import { SlaCalendarForm } from "@/components/sla/sla-calendar-form";
import { SlaCalendarWeekGrid } from "@/components/sla/sla-calendar-week-grid";
import { SlaChangeLogPanel } from "@/components/sla/sla-change-log-panel";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input } from "@/components/ui/field";
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
  const [isChangesLoading, setIsChangesLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<SlaErrorKey | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [changesRevision, setChangesRevision] = useState(0);
  const selected = calendars.find((calendar) => calendar.id === selectedId);

  const loadCalendars = useCallback(async (preferredId?: string | null) => {
    setIsLoading(true);
    setErrorKey(null);
    try {
      const items = await listSlaCalendars();
      setCalendars(items);
      setSelectedId((currentId) => {
        const candidateId = preferredId === undefined ? currentId : preferredId;
        return candidateId !== null && items.some((item) => item.id === candidateId)
          ? candidateId
          : items[0]?.id ?? null;
      });
    } catch (error) {
      setCalendars([]);
      setSelectedId(null);
      setErrorKey(mapSlaError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCalendars();
  }, [loadCalendars]);

  useEffect(() => {
    if (selectedId === null) {
      setChanges([]);
      setIsChangesLoading(false);
      return;
    }
    let cancelled = false;
    setIsChangesLoading(true);
    setErrorKey(null);
    void listSlaCalendarChanges(selectedId)
      .then((items) => {
        if (!cancelled) setChanges(items);
      })
      .catch((error) => {
        if (!cancelled) {
          setChanges([]);
          setErrorKey(mapSlaError(error));
        }
      })
      .finally(() => {
        if (!cancelled) setIsChangesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [changesRevision, selectedId]);

  const save = async (input: CalendarWriteInput & { readonly key: string }) => {
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      const preferredId =
        selected === undefined
          ? (await createSlaCalendar(input)).id
          : (await updateSlaCalendar(selected.id, input)).id;
      setChangesRevision((value) => value + 1);
      await loadCalendars(preferredId);
      return true;
    } catch (error) {
      setErrorKey(mapSlaError(error));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const remove = async () => {
    if (selected === undefined || deleteReason.trim().length === 0) return;
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await deleteSlaCalendar(selected.id, deleteReason.trim());
      setIsDeleteOpen(false);
      setDeleteReason("");
      setChangesRevision((value) => value + 1);
      await loadCalendars(null);
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fade-in grid gap-4 xl:grid-cols-[300px_1fr]">
      <SlaAdminListColumn
        isLoading={isLoading}
        isEmpty={calendars.length === 0}
        loadingLabel={t("sla.calendarsHeading")}
        emptyTitle={t("sla.calendarsEmptyTitle")}
        emptyBody={t("sla.calendarsEmptyBody")}
        newLabel={t("sla.newCalendar")}
        onNew={() => {
          setErrorKey(null);
          setDeleteReason("");
          setSelectedId(null);
        }}
      >
        {calendars.map((calendar) => (
          <SlaAdminSelectorCard
            key={calendar.id}
            isSelected={calendar.id === selectedId}
            onSelect={() => {
              setErrorKey(null);
              setSelectedId(calendar.id);
            }}
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
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setErrorKey(null);
                    setDeleteReason("");
                    setIsDeleteOpen(true);
                  }}
                >
                  {t("sla.deleteCalendarAction")}
                </Button>
              ) : null
            }
          />
          <div className="px-4 py-3.5">
            {errorKey && !isDeleteOpen ? (
              <p role="alert" className={`mb-3 ${errorTextClassName}`}>
                {t(errorKey)}
              </p>
            ) : null}
            <SlaCalendarForm
              key={selected?.id ?? "new"}
              calendar={selected}
              errorKey={null}
              isSubmitting={isSubmitting || isLoading}
              onSubmit={save}
            />
          </div>
        </Card>
        {selected ? (
          <Card>
            <CardHeader title={t("sla.changeLogHeading")} subtitle={t("sla.changeLogHint")} />
            <div className="px-4 py-3.5">
              {isChangesLoading ? (
                <PanelSkeleton className="mt-0" label={t("sla.changeLogHeading")} />
              ) : (
                <SlaChangeLogPanel entries={changes} />
              )}
            </div>
          </Card>
        ) : null}
      </div>
      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title={t("sla.deleteCalendarTitle")}
        description={t("sla.deleteCalendarDescription", { name: selected?.name ?? "" })}
        confirmLabel={t("sla.deleteCalendarConfirm")}
        intent="danger"
        isPending={isSubmitting}
        confirmDisabled={deleteReason.trim().length === 0}
        onConfirm={() => void remove()}
      >
        <div className="grid gap-2">
          <Field label={t("sla.reason")} required>
            <Input
              value={deleteReason}
              maxLength={512}
              onChange={(event) => setDeleteReason(event.target.value)}
            />
          </Field>
          {errorKey && isDeleteOpen ? (
            <p role="alert" className={errorTextClassName}>
              {t(errorKey)}
            </p>
          ) : null}
        </div>
      </ConfirmDialog>
    </div>
  );
}
