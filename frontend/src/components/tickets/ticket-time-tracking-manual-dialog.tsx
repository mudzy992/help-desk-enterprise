import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/time-tracking/summarize-time-logs";
import type { ManualEntryInput } from "@/lib/time-tracking/use-ticket-time-tracking";

export interface ManualEntryDialogProperties {
  readonly maxMinutes: number;
  readonly maxBackdateDays: number;
  readonly isSaving: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (entry: ManualEntryInput) => Promise<void>;
}

export function ManualEntryDialog(props: ManualEntryDialogProperties) {
  const { t } = useTranslation();
  const [startedAt, setStartedAt] = useState(() =>
    toLocalInputValue(new Date(Date.now() - 3_600_000).toISOString()),
  );
  const [minutes, setMinutes] = useState("30");
  const [note, setNote] = useState("");
  const startedIso = fromLocalInputValue(startedAt);
  const duration = Number(minutes);
  const valid =
    startedIso !== null &&
    Number.isInteger(duration) &&
    duration >= 1 &&
    duration <= props.maxMinutes &&
    note.trim().length > 0;
  return (
    <Modal open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <ModalContent>
        <ModalHeader
          title={t("tickets.timeTracking.manualTitle")}
          description={t("tickets.timeTracking.manualHint", {
            days: props.maxBackdateDays,
            minutes: props.maxMinutes,
          })}
        />
        <div className="space-y-3">
          <Field label={t("tickets.timeTracking.startedAt")} required>
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                data-testid="time-manual-start"
                value={startedAt}
                max={toLocalInputValue(new Date().toISOString())}
                onChange={(event) => setStartedAt(event.currentTarget.value)}
              />
            )}
          </Field>
          <Field label={t("tickets.timeTracking.durationMinutes")} required>
            {(control) => (
              <Input
                {...control}
                type="number"
                min={1}
                max={props.maxMinutes}
                data-testid="time-manual-minutes"
                value={minutes}
                onChange={(event) => setMinutes(event.currentTarget.value)}
              />
            )}
          </Field>
          <Field label={t("tickets.timeTracking.note")} required>
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                data-testid="time-manual-note"
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
              />
            )}
          </Field>
        </div>
        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={props.onClose}
            disabled={props.isSaving}
          >
            {t("ui.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!valid || props.isSaving}
            data-testid="time-manual-save"
            onClick={() =>
              startedIso !== null &&
              void props.onSubmit({
                startedAt: startedIso,
                durationMinutes: duration,
                note: note.trim(),
              })
            }
          >
            {t("tickets.timeTracking.save")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
