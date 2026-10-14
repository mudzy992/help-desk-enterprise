import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/time-tracking/summarize-time-logs";
import type { CorrectionInput } from "@/lib/time-tracking/use-ticket-time-tracking";
import type { TicketTimeLogResponse } from "@/services/tickets-collaboration-api";

export function TicketTimeTrackingCorrectionDialog(props: {
  readonly item: TicketTimeLogResponse;
  readonly isSaving: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (correction: CorrectionInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const initialStart = toLocalInputValue(props.item.startedAt);
  const initialEnd = props.item.endedAt === null ? "" : toLocalInputValue(props.item.endedAt);
  const [startedAt, setStartedAt] = useState(initialStart);
  const [endedAt, setEndedAt] = useState(initialEnd);
  const [note, setNote] = useState(props.item.note ?? "");
  const [reason, setReason] = useState("");
  const startIso = fromLocalInputValue(startedAt);
  const endIso = fromLocalInputValue(endedAt);
  const changed =
    startedAt !== initialStart || endedAt !== initialEnd || note !== (props.item.note ?? "");
  const valid =
    changed &&
    reason.trim().length > 0 &&
    startIso !== null &&
    endIso !== null &&
    new Date(endIso).getTime() > new Date(startIso).getTime();
  return (
    <Modal open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <ModalContent>
        <ModalHeader
          title={t("tickets.timeTracking.editTitle")}
          description={t("tickets.timeTracking.editHint")}
        />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("tickets.timeTracking.startedAt")} required>
              <Input
                type="datetime-local"
                value={startedAt}
                onChange={(event) => setStartedAt(event.currentTarget.value)}
              />
            </Field>
            <Field label={t("tickets.timeTracking.endedAt")} required>
              <Input
                type="datetime-local"
                value={endedAt}
                data-testid="time-edit-end"
                onChange={(event) => setEndedAt(event.currentTarget.value)}
              />
            </Field>
          </div>
          <Field label={t("tickets.timeTracking.note")}>
            <Textarea
              rows={2}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
          </Field>
          <Field label={t("tickets.timeTracking.reason")} required>
            <Input
              data-testid="time-edit-reason"
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
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
            data-testid="time-edit-save"
            onClick={() =>
              void props.onSubmit({
                ...(startedAt !== initialStart && startIso !== null ? { startedAt: startIso } : {}),
                ...(endedAt !== initialEnd && endIso !== null ? { endedAt: endIso } : {}),
                ...(note !== (props.item.note ?? "") ? { note } : {}),
                reason: reason.trim(),
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

export function TicketTimeTrackingDeleteDialog(props: {
  readonly isSaving: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => (open ? undefined : props.onClose())}
      title={t("tickets.timeTracking.deleteTitle")}
      description={t("tickets.timeTracking.deleteHint")}
      confirmLabel={t("tickets.timeTracking.delete")}
      intent="danger"
      isPending={props.isSaving || reason.trim().length === 0}
      onConfirm={() => void props.onSubmit(reason.trim())}
    >
      <Field label={t("tickets.timeTracking.reason")} required>
        <Input
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value)}
        />
      </Field>
    </ConfirmDialog>
  );
}
