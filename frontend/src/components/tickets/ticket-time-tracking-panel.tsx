import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TicketTimeTrackingCorrectionDialog,
  TicketTimeTrackingDeleteDialog,
} from "@/components/tickets/ticket-time-tracking-correction-dialogs";
import { TicketTimeTrackingElapsed } from "@/components/tickets/ticket-time-tracking-elapsed";
import { ManualEntryDialog } from "@/components/tickets/ticket-time-tracking-manual-dialog";
import { TicketTimeLogRow } from "@/components/tickets/ticket-time-log-row";
import { TicketTimeUserSummary } from "@/components/tickets/ticket-time-user-summary";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDurationMinutes } from "@/lib/tickets/ticket-display";
import { summarizeTimeByUser } from "@/lib/time-tracking/summarize-time-logs";
import type { TicketTimeTrackingControls } from "@/lib/time-tracking/use-ticket-time-tracking";
import type { TicketTimeLogResponse } from "@/services/tickets-collaboration-api";

interface TicketTimeTrackingPanelProperties {
  readonly items: readonly TicketTimeLogResponse[];
  readonly visible: boolean;
  /** Start/stop/manual entry — false on archived or merged tickets. */
  readonly canTrack: boolean;
  readonly currentUserId: string | null;
  readonly ticketNumber: string;
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
  ticketNumber,
  userNames,
  controls,
}: TicketTimeTrackingPanelProperties) {
  const { t, i18n } = useTranslation();
  const [manualOpen, setManualOpen] = useState(false);
  const [target, setTarget] = useState<EditTarget | null>(null);
  if (!visible) return null;

  const liveItems = items.filter((item) => (item.deletedAt ?? null) === null);
  const totalSeconds = liveItems.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
  const perUser = summarizeTimeByUser(items);
  const active = liveItems.find((item) => item.endedAt === null && item.userId === currentUserId);
  const policy = controls.policy;
  const manualEnabled = canTrack && policy !== null && policy.manualEntryEnabled;
  const nameOf = (userId: string | null | undefined) =>
    (userId ? userNames.get(userId) : undefined) ?? t("tickets.detail.unknownUser");
  const canEdit = (item: TicketTimeLogResponse) => {
    if (item.endedAt === null || (item.deletedAt ?? null) !== null) return false;
    if (controls.canManage) return true;
    if (item.userId !== currentUserId || policy === null) return false;
    return new Date(item.startedAt).getTime() >= Date.now() - policy.maxBackdateDays * 86_400_000;
  };

  return (
    <Card className="fade-in">
      <CardHeader
        title={t("tickets.detail.timeLogged")}
        subtitle={t("tickets.detail.timeTotal", {
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
              <>
                <TicketTimeTrackingElapsed
                  startedAt={active.startedAt}
                  ticketNumber={ticketNumber}
                />
                <Button
                  type="button"
                  size="xs"
                  disabled={controls.isSaving}
                  data-testid="time-stop"
                  onClick={() => void controls.stop(active.id)}
                >
                  {t("tickets.detail.stopTimer")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={controls.isSaving}
                data-testid="time-start"
                onClick={() => void controls.start()}
              >
                {t("tickets.detail.startTimer")}
              </Button>
            )}
          </div>
        }
      />
      {controls.errorKey !== null ? (
        <div
          role="alert"
          className="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-md bg-danger/10 px-3 py-2 text-[12px] text-danger"
        >
          <span>{t(controls.errorKey)}</span>
          <Button type="button" size="xs" variant="outline" onClick={() => void controls.reload()}>
            {t("tickets.retry")}
          </Button>
        </div>
      ) : null}
      <TicketTimeUserSummary entries={perUser} nameOf={nameOf} />
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
          {items.map((item) => (
            <TicketTimeLogRow
              key={item.id}
              item={item}
              locale={i18n.language}
              nameOf={nameOf}
              canEdit={canEdit(item)}
              onEdit={() => setTarget({ item, mode: "edit" })}
              onDelete={() => setTarget({ item, mode: "delete" })}
            />
          ))}
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
        onConfirm={() => void controls.start({ switchFromActive: true })}
      />
      {manualOpen && policy !== null ? (
        <ManualEntryDialog
          maxMinutes={policy.manualMaxMinutes}
          maxBackdateDays={policy.maxBackdateDays}
          isSaving={controls.isSaving}
          onClose={() => setManualOpen(false)}
          onSubmit={async (entry) => {
            if (await controls.addManual(entry)) setManualOpen(false);
          }}
        />
      ) : null}
      {target?.mode === "edit" ? (
        <TicketTimeTrackingCorrectionDialog
          item={target.item}
          isSaving={controls.isSaving}
          onClose={() => setTarget(null)}
          onSubmit={async (correction) => {
            if (await controls.correct(target.item.id, correction)) setTarget(null);
          }}
        />
      ) : null}
      {target?.mode === "delete" ? (
        <TicketTimeTrackingDeleteDialog
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
