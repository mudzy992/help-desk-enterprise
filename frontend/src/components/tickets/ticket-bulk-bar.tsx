import { useState } from "react";
import { CheckSquare, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlCompactClassName, selectCompactClassName } from "@/components/ui/control";
import { isBulkCloseStatus } from "@/lib/tickets/is-bulk-close-status";
import { mapTicketError, type TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import {
  ticketPriorityValues,
  ticketStatusValues,
  ticketPriorityLabelKey,
  ticketStatusLabelKey,
} from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import {
  executeTicketBulk,
  previewTicketBulk,
  type TicketBulkActionType,
} from "@/services/tickets-bulk-api";

interface TicketBulkBarProperties {
  readonly selectedIds: ReadonlySet<string>;
  readonly onClear: () => void;
  readonly onError: (key: TicketErrorKey) => void;
  readonly onComplete: () => void;
}

export function TicketBulkBar({
  selectedIds,
  onClear,
  onError,
  onComplete,
}: TicketBulkBarProperties) {
  const { t } = useTranslation();
  const [actionType, setActionType] = useState<TicketBulkActionType>("assign_group");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [broadcastArmed, setBroadcastArmed] = useState(false);
  if (selectedIds.size === 0) {
    return null;
  }
  const ticketIds = [...selectedIds];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/35 bg-primary/10 px-3 py-2">
      <CheckSquare size={14} className="text-[#7FA8F5]" />
      <span className="tnum text-[12.5px] font-medium text-foreground">{ticketText(t, "tickets.bulk.selected", { count: selectedIds.size })}</span>
      <div className="mx-1 h-4 w-px bg-border" />
      <select className={`${selectCompactClassName} w-auto min-w-[10rem]`} value={actionType} onChange={(event) => setActionType(event.target.value as TicketBulkActionType)}>
        <option value="assign_group">{t("tickets.bulk.assignGroup")}</option>
        <option value="assign_user">{t("tickets.bulk.assignUser")}</option>
        <option value="set_status">{t("tickets.bulk.setStatus")}</option>
        <option value="set_priority">{t("tickets.bulk.setPriority")}</option>
        <option value="broadcast_message">{t("tickets.bulk.broadcast")}</option>
        <option value="merge_into_parent">{t("tickets.bulk.merge")}</option>
      </select>
      {actionType === "set_status" ? (
        <select className={`${selectCompactClassName} w-auto min-w-[9rem]`} value={value} onChange={(event) => setValue(event.target.value)}>
          <option value="">{t("tickets.filters.all")}</option>
          {ticketStatusValues.filter((status) => !isBulkCloseStatus(status)).map((status) => (
            <option key={status} value={status}>{ticketText(t, ticketStatusLabelKey[status])}</option>
          ))}
        </select>
      ) : actionType === "set_priority" ? (
        <select className={`${selectCompactClassName} w-auto min-w-[9rem]`} value={value} onChange={(event) => setValue(event.target.value)}>
          <option value="">{t("tickets.filters.all")}</option>
          {ticketPriorityValues.map((priority) => (
            <option key={priority} value={priority}>{ticketText(t, ticketPriorityLabelKey[priority])}</option>
          ))}
        </select>
      ) : (
        <input className={`${controlCompactClassName} w-40`} value={value} onChange={(event) => setValue(event.target.value)} placeholder={t("tickets.bulk.valuePlaceholder")} />
      )}
      <input className={`${controlCompactClassName} w-44`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("tickets.bulk.reasonPlaceholder")} />
      <span className="text-[11px] text-muted-foreground">{t("tickets.bulk.closeForbidden")}</span>
      {broadcastArmed ? (
        <span className="text-[11px] text-muted-foreground">{t("tickets.bulk.confirmRecipients")}</span>
      ) : null}
      <Button type="button" size="sm" disabled={busy} onClick={() => void runBulk()}>
        {busy ? t("tickets.bulk.applying") : broadcastArmed ? t("tickets.bulk.confirmSend") : t("tickets.bulk.apply")}
      </Button>
      <button type="button" onClick={onClear} className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground">
        <X size={13} />
      </button>
    </div>
  );

  async function runBulk() {
    setBusy(true);
    try {
      if (actionType === "broadcast_message") {
        const preview = await previewTicketBulk(ticketIds);
        if (preview.requiresBroadcastConfirmation && !broadcastArmed) {
          setBroadcastArmed(true);
          return;
        }
        await executeTicketBulk({
          ticketIds,
          actionType,
          previewConfirmed: true,
          broadcastConfirmed: preview.requiresBroadcastConfirmation ? true : undefined,
          whatHappened: reason || value,
          whoAffected: preview.recipientCount.toString(),
          eta: value || "n/a",
        });
        setBroadcastArmed(false);
      } else {
        await executeTicketBulk({
          ticketIds,
          actionType,
          assignedGroupId: actionType === "assign_group" ? value : undefined,
          assignedUserId: actionType === "assign_user" ? value : undefined,
          status: actionType === "set_status" ? (value as never) : undefined,
          priority: actionType === "set_priority" ? (value as never) : undefined,
          parentTicketId: actionType === "merge_into_parent" ? value || ticketIds[0] : undefined,
          reason,
        });
      }
      onComplete();
    } catch (error) {
      onError(mapTicketError(error));
    } finally {
      setBusy(false);
    }
  }
}
