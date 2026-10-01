import { useState } from "react";
import { CheckSquare, Puzzle, Siren, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProblemLinkDialog, type ProblemLinkTicket } from "@/components/problems/problem-link-dialog";
import { IncidentFormDialog } from "@/components/status/incident-form-dialog";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { controlCompactClassName, selectCompactClassName } from "@/components/ui/control";
import { permissionKeys, roleKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
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

/** Mirrors the backend limit on tickets linked at creation. */
const incidentTicketLimit = 100;
/** Mirrors the backend limit on tickets linked to a problem in one request. */
const problemTicketLimit = 50;

interface TicketBulkBarProperties {
  readonly selectedIds: ReadonlySet<string>;
  readonly onClear: () => void;
  readonly onError: (key: TicketErrorKey) => void;
  readonly onComplete: () => void;
  /** Package 1.2: ticket numbers of the selection, to pick the merge parent. */
  readonly ticketNumbers?: ReadonlyMap<string, string>;
  /** Paket 3.3: number, title and priority of the selection ("Create problem"). */
  readonly ticketSummaries?: ReadonlyMap<string, ProblemLinkTicket>;
}

export function TicketBulkBar({
  selectedIds,
  onClear,
  onError,
  onComplete,
  ticketNumbers,
  ticketSummaries,
}: TicketBulkBarProperties) {
  const { t } = useTranslation();
  const [actionType, setActionType] = useState<TicketBulkActionType>("assign_group");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [broadcastArmed, setBroadcastArmed] = useState(false);
  // Paket 2.7 (§8.3): "Create incident from selected" (status.incidents.manage).
  const [incidentOpen, setIncidentOpen] = useState(false);
  // Paket 3.3 (§8.1): "Create problem" / "Add to problem" (problem.manage).
  const [problemOpen, setProblemOpen] = useState(false);
  const { toast } = useToast();
  const { session, hasPermission, hasRole } = useSessionCapabilities();
  const canLinkProblem =
    session?.modules?.problems === true &&
    (session.isSuperAdmin === true || hasRole(roleKeys.superAdmin) || hasPermission(permissionKeys.problemManage));
  const canCreateIncident =
    session?.isSuperAdmin === true || hasRole(roleKeys.superAdmin) || hasPermission(permissionKeys.statusIncidentsManage);
  if (selectedIds.size === 0) {
    return null;
  }
  const ticketIds = [...selectedIds];
  return (
    <div className="pop-in mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/6 px-3 py-2 shadow-card">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-surface px-2 py-0.5 text-[11.5px] font-medium text-link">
        <CheckSquare size={12} aria-hidden="true" />
        <span className="tnum">{ticketText(t, "tickets.bulk.selected", { count: selectedIds.size })}</span>
      </span>
      <div className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
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
      ) : actionType === "merge_into_parent" ? (
        <select
          className={`${selectCompactClassName} w-auto min-w-[9rem]`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={t("tickets.bulk.mergeParent")}
          data-testid="ticket-bulk-merge-parent"
        >
          <option value="">{t("tickets.bulk.mergeParent")}</option>
          {ticketIds.map((id) => (
            <option key={id} value={id}>{ticketNumbers?.get(id) ?? id}</option>
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
      <Button
        type="button"
        size="sm"
        disabled={
          busy ||
          (actionType === "merge_into_parent" && (value === "" || !selectedIds.has(value) || reason.trim().length < 3))
        }
        onClick={() => void runBulk()} className="ml-auto">
        {busy ? t("tickets.bulk.applying") : broadcastArmed ? t("tickets.bulk.confirmSend") : t("tickets.bulk.apply")}
      </Button>
      {canCreateIncident ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || selectedIds.size > incidentTicketLimit}
          title={selectedIds.size > incidentTicketLimit ? t("status.bulk.tooMany", { max: incidentTicketLimit }) : undefined}
          onClick={() => setIncidentOpen(true)}
          data-testid="ticket-bulk-create-incident"
        >
          <Siren />
          {t("status.bulk.create")}
        </Button>
      ) : null}
      {canLinkProblem ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || selectedIds.size > problemTicketLimit}
          title={selectedIds.size > problemTicketLimit ? t("problems.link.tooMany", { max: problemTicketLimit }) : undefined}
          onClick={() => setProblemOpen(true)}
          data-testid="ticket-bulk-problem"
        >
          <Puzzle />
          {t("problems.link.bulkButton")}
        </Button>
      ) : null}
      {problemOpen ? (
        <ProblemLinkDialog
          open
          onOpenChange={(open) => (open ? undefined : setProblemOpen(false))}
          tickets={ticketIds.map(
            (id) => ticketSummaries?.get(id) ?? { id, ticketNumber: ticketNumbers?.get(id) ?? id, title: "", priority: "MEDIUM" as const },
          )}
          onDone={({ number, result }) => {
            toast({ tone: "success", title: t("problems.link.doneToast", { number, count: result?.linked.length ?? 0 }) });
            onClear();
            onComplete();
          }}
        />
      ) : null}
      {incidentOpen ? (
        <IncidentFormDialog
          open
          onOpenChange={(open) => (open ? undefined : setIncidentOpen(false))}
          mode={{ kind: "create", ticketIds }}
          onSaved={() => {
            onClear();
            onComplete();
          }}
        />
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClear}
        aria-label={t("tickets.bulk.clear")}
      >
        <X size={13} />
      </Button>
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
          parentTicketId: actionType === "merge_into_parent" ? value : undefined,
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
