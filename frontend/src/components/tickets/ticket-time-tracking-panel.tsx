import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal, ModalContent, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { RelativeTime } from "@/components/ui/relative-time";
import { cn } from "@/lib/utils";
import { formatDurationMinutes } from "@/lib/tickets/ticket-display";
import { ticketText } from "@/lib/tickets/ticket-text";
import {
  fromLocalInputValue,
  summarizeTimeByUser,
  toLocalInputValue,
} from "@/lib/time-tracking/summarize-time-logs";
import type { TicketTimeTrackingControls } from "@/lib/time-tracking/use-ticket-time-tracking";
import type { TicketTimeLogResponse } from "@/services/tickets-collaboration-api";

interface TicketTimeTrackingPanelProperties {
  readonly items: readonly TicketTimeLogResponse[];
  readonly visible: boolean;
  /** Start/stop/manual entry — false on archived or merged tickets. */
  readonly canTrack: boolean;
  readonly currentUserId: string | null;
  readonly userNames: ReadonlyMap<string, string>;
  readonly controls: TicketTimeTrackingControls;
}

type EditTarget = { readonly item: TicketTimeLogResponse; readonly mode: "edit" | "delete" };

/** Package 1.3: time entries of the ticket, guarded timer, manual entry and corrections. */
export function TicketTimeTrackingPanel({
  items,
  visible,
  canTrack,
  currentUserId,
  userNames,
  controls,
}: TicketTimeTrackingPanelProperties) {
  const { t, i18n } = useTranslation();
  const [manualOpen, setManualOpen] = useState(false);
  const [target, setTarget] = useState<EditTarget | null>(null);
  if (!visible) {
    return null;
  }
  const liveItems = items.filter((item) => (item.deletedAt ?? null) === null);
  const totalSeconds = liveItems.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
  const perUser = summarizeTimeByUser(items);
  const active = liveItems.find((item) => item.endedAt === null && item.userId === currentUserId);
  const policy = controls.policy;
  const manualEnabled = canTrack && (policy?.manualEntryEnabled ?? true);
  const nameOf = (userId: string | null | undefined) =>
    (userId ? userNames.get(userId) : undefined) ?? t("tickets.detail.unknownUser");
  const canEdit = (item: TicketTimeLogResponse) => {
    if (item.endedAt === null || (item.deletedAt ?? null) !== null) return false;
    if (controls.canManage) return true;
    if (item.userId !== currentUserId) return false;
    const windowDays = policy?.maxBackdateDays ?? 7;
    return new Date(item.startedAt).getTime() >= Date.now() - windowDays * 86_400_000;
  };

  return (
    <Card className="fade-in">
      <CardHeader
        title={t("tickets.detail.timeLogged")}
        subtitle={ticketText(t, "tickets.detail.timeTotal", {
          total: formatDurationMinutes(totalSeconds),
        })}
        actions={
          <div className="flex items-center gap-1.5">
            {manualEnabled ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={controls.isSaving}
                data-testid="time-manual-open"
                onClick={() => setManualOpen(true)}
              >
                <Plus size={13} />
                {t("tickets.timeTracking.addManual")}
              </Button>
            ) : null}
            {!canTrack ? null : active ? (
              <Button
                type="button"
                size="xs"
                disabled={controls.isSaving}
                data-testid="time-stop"
                onClick={() => void controls.stop(active.id)}
              >
                {t("tickets.detail.stopTimer")}
              </Button>
            ) : (
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={controls.isSaving}
                data-testid="time-start"
                onClick={() => void controls.start(false)}
              >
                {t("tickets.detail.startTimer")}
              </Button>
            )}
          </div>
        }
      />
      {controls.errorKey !== null ? (
        <p role="alert" className="mx-4 mb-2 rounded-md bg-danger/10 px-3 py-2 text-[12px] text-danger">
          {t(controls.errorKey)}
        </p>
      ) : null}
      {perUser.length > 1 ? (
        <p className="px-4 pb-2 text-[11.5px] text-muted-foreground" data-testid="time-per-user">
          {perUser
            .map((entry) => `${nameOf(entry.userId)} ${formatDurationMinutes(entry.seconds)}`)
            .join(" · ")}
        </p>
      ) : null}
      {controls.canManage ? (
        <div className="border-b border-border/50 px-4 pb-3 pt-1">
          <Checkbox
            className="text-[12.5px] text-muted-foreground"
            label={t("tickets.timeTracking.showDeleted")}
            checked={controls.showDeleted}
            onChange={(event) => controls.setShowDeleted(event.currentTarget.checked)}
          />
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-muted-foreground">
          {t("tickets.detail.noTimeLogs")}
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {items.map((item) => {
            const name = nameOf(item.userId);
            const deleted = (item.deletedAt ?? null) !== null;
            const corrected = (item.correctedAt ?? null) !== null;
            return (
              <li
                key={item.id}
                data-testid="time-log-row"
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-surface-hover",
                  item.endedAt === null && "bg-primary/6",
                  deleted && "opacity-60",
                )}
              >
                <Avatar name={name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[12.5px] text-foreground/90", deleted && "line-through")}>
                    {name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    <RelativeTime value={item.startedAt} locale={i18n.language} />
                    {item.note ? <span> · {item.note}</span> : null}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {item.source === "MANUAL" ? (
                      <Badge tone="info">{t("tickets.timeTracking.sourceManual")}</Badge>
                    ) : null}
                    {item.stopReason === "AUTO_IDLE" ? (
                      <Badge tone="warning">{t("tickets.timeTracking.stopIdle")}</Badge>
                    ) : null}
                    {item.stopReason === "AUTO_MAX_DURATION" ? (
                      <Badge tone="warning">{t("tickets.timeTracking.stopMax")}</Badge>
                    ) : null}
                    {item.stopReason === "AUTO_TICKET_CLOSED" ? (
                      <Badge tone="neutral">{t("tickets.timeTracking.stopClosed")}</Badge>
                    ) : null}
                    {corrected ? (
                      <span
                        title={t("tickets.timeTracking.correctedTooltip", {
                          user: nameOf(item.correctedByUserId),
                          reason: item.correctionReason ?? "",
                        })}
                      >
                        <Badge tone="neutral">{t("tickets.timeTracking.corrected")}</Badge>
                      </span>
                    ) : null}
                    {deleted ? (
                      <span
                        title={t("tickets.timeTracking.deletedTooltip", {
                          user: nameOf(item.deletedByUserId),
                          reason: item.deleteReason ?? "",
                        })}
                      >
                        <Badge tone="danger">{t("tickets.timeTracking.deleted")}</Badge>
                      </span>
                    ) : null}
                  </div>
                </div>
                <Badge tone="neutral" className="tnum">
                  {formatDurationMinutes(item.durationSeconds)}
                </Badge>
                {canEdit(item) ? (
                  <div className="flex items-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      data-testid="time-log-edit"
                      aria-label={t("tickets.timeTracking.edit")}
                      title={t("tickets.timeTracking.edit")}
                      onClick={() => setTarget({ item, mode: "edit" })}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={t("tickets.timeTracking.delete")}
                      title={t("tickets.timeTracking.delete")}
                      onClick={() => setTarget({ item, mode: "delete" })}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={controls.switchPrompt}
        onOpenChange={(open) => {
          if (!open) controls.closeSwitchPrompt();
        }}
        title={t("tickets.timeTracking.switchTitle")}
        description={t("tickets.timeTracking.switchBody", {
          ticket: controls.activeElsewhere?.ticketNumber ?? "",
        })}
        confirmLabel={t("tickets.timeTracking.switchConfirm")}
        isPending={controls.isSaving}
        onConfirm={() => void controls.start(true)}
      />
      {manualOpen ? (
        <ManualEntryDialog
          maxMinutes={policy?.manualMaxMinutes ?? 480}
          maxBackdateDays={policy?.maxBackdateDays ?? 7}
          isSaving={controls.isSaving}
          onClose={() => setManualOpen(false)}
          onSubmit={async (entry) => {
            if (await controls.addManual(entry)) setManualOpen(false);
          }}
        />
      ) : null}
      {target?.mode === "edit" ? (
        <CorrectionDialog
          item={target.item}
          isSaving={controls.isSaving}
          onClose={() => setTarget(null)}
          onSubmit={async (correction) => {
            if (await controls.correct(target.item.id, correction)) setTarget(null);
          }}
        />
      ) : null}
      {target?.mode === "delete" ? (
        <DeleteDialog
          isSaving={controls.isSaving}
          onClose={() => setTarget(null)}
          onSubmit={async (reason) => {
            if (await controls.remove(target.item.id, reason)) setTarget(null);
          }}
        />
      ) : null}
    </Card>
  );
}

function ManualEntryDialog(props: {
  readonly maxMinutes: number;
  readonly maxBackdateDays: number;
  readonly isSaving: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (entry: {
    readonly startedAt: string;
    readonly durationMinutes: number;
    readonly note: string;
  }) => Promise<void>;
}) {
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
            <Input
              type="datetime-local"
              data-testid="time-manual-start"
              value={startedAt}
              max={toLocalInputValue(new Date().toISOString())}
              onChange={(event) => setStartedAt(event.currentTarget.value)}
            />
          </Field>
          <Field label={t("tickets.timeTracking.durationMinutes")} required>
            <Input
              type="number"
              min={1}
              max={props.maxMinutes}
              data-testid="time-manual-minutes"
              value={minutes}
              onChange={(event) => setMinutes(event.currentTarget.value)}
            />
          </Field>
          <Field label={t("tickets.timeTracking.note")} required>
            <Textarea
              rows={3}
              data-testid="time-manual-note"
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
          </Field>
        </div>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={props.onClose} disabled={props.isSaving}>
            {t("ui.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!valid || props.isSaving}
            data-testid="time-manual-save"
            onClick={() =>
              startedIso !== null &&
              void props.onSubmit({ startedAt: startedIso, durationMinutes: duration, note: note.trim() })
            }
          >
            {t("tickets.timeTracking.save")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function CorrectionDialog(props: {
  readonly item: TicketTimeLogResponse;
  readonly isSaving: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (correction: {
    readonly startedAt?: string;
    readonly endedAt?: string;
    readonly note?: string;
    readonly reason: string;
  }) => Promise<void>;
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
          <Button type="button" variant="secondary" onClick={props.onClose} disabled={props.isSaving}>
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

function DeleteDialog(props: {
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
        <Input maxLength={500} value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
      </Field>
    </ConfirmDialog>
  );
}
