import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TicketConfidentialBadge, TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { TicketResolveFields } from "@/components/tickets/ticket-resolve-fields";
import { Button } from "@/components/ui/button";
import { controlClassName, labelClassName } from "@/components/ui/control";
import { PageHeader } from "@/components/ui/page-header";
import { canShowClaimAction, canShowReopenAction, nextTicketStatuses } from "@/lib/tickets/ticket-actions";
import { isResolveOrCloseStatus } from "@/lib/tickets/is-resolve-or-close-status";
import type { TicketResponse, TicketStatus, UpdateTicketInput } from "@/services/tickets-api";

interface TicketDetailHeaderProperties {
  readonly ticket: TicketResponse;
  readonly serviceName: string;
  readonly canChangeStatus: boolean;
  readonly claiming: boolean;
  readonly savingStatus: boolean;
  readonly reopening: boolean;
  readonly onClaim: () => void;
  readonly onStatusChange: (status: TicketStatus, extras?: UpdateTicketInput) => void;
  readonly onReopen: () => void;
}

export function TicketDetailHeader({
  ticket,
  serviceName,
  canChangeStatus,
  claiming,
  savingStatus,
  reopening,
  onClaim,
  onStatusChange,
  onReopen,
}: TicketDetailHeaderProperties) {
  const { t } = useTranslation();
  const nextStatuses = nextTicketStatuses(ticket.status);
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);
  const [closeCode, setCloseCode] = useState(ticket.closePolicy?.closeCode?.key ?? "");
  const [resolutionNote, setResolutionNote] = useState(ticket.closePolicy?.resolutionNote ?? "");
  return (
    <header>
      <PageHeader
        crumbs={["EP-HelpDesk", t("tickets.title"), ticket.ticketNumber]}
        title={ticket.title}
        subtitle={serviceName}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum text-[#7FA8F5]">{ticket.ticketNumber}</span>
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge
              priority={ticket.priority}
              showCriticalMark
            />
            {ticket.isConfidential ? <TicketConfidentialBadge /> : null}
            {canShowClaimAction(ticket) ? (
              <Button type="button" size="sm" disabled={claiming} onClick={onClaim}>
                {claiming ? t("tickets.claiming") : t("tickets.claim")}
              </Button>
            ) : null}
            {canShowReopenAction(ticket) ? (
              <Button type="button" size="sm" disabled={reopening} onClick={onReopen}>
                {reopening
                  ? t("tickets.detail.reopening")
                  : ticket.reopen?.createsNewTicket
                    ? t("tickets.detail.reopenAsNew")
                    : t("tickets.detail.reopen")}
              </Button>
            ) : null}
          </div>
        }
      />
      {ticket.status === "WAITING_FOR_USER" ? (
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          {t("tickets.detail.waitingForUserHint")}
        </p>
      ) : null}
      {canChangeStatus && nextStatuses.length > 0 ? (
        <label className={`mt-1 max-w-xs ${labelClassName}`}>
          {t("tickets.detail.changeStatus")}
          <select
            className={controlClassName}
            value=""
            disabled={savingStatus || pendingStatus !== null}
            onChange={(event) => {
              if (event.target.value.length === 0) {
                return;
              }
              const status = event.target.value as TicketStatus;
              if (isResolveOrCloseStatus(status)) {
                setPendingStatus(status);
                return;
              }
              onStatusChange(status);
            }}
          >
            <option value="">{savingStatus ? t("tickets.detail.saving") : "—"}</option>
            {nextStatuses.map((status) => (
              <option key={status} value={status}>
                {t(`tickets.status.${status}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {pendingStatus !== null && ticket.status !== pendingStatus ? (
        <TicketResolveFields
          pendingStatus={pendingStatus}
          closePolicy={ticket.closePolicy}
          closeCode={closeCode}
          resolutionNote={resolutionNote}
          saving={savingStatus}
          onCloseCodeChange={setCloseCode}
          onResolutionNoteChange={setResolutionNote}
          onConfirm={() => {
            onStatusChange(pendingStatus, {
              closeCode: closeCode.length > 0 ? closeCode : undefined,
              resolutionNote: resolutionNote.length > 0 ? resolutionNote : undefined,
            });
          }}
          onCancel={() => setPendingStatus(null)}
        />
      ) : null}
    </header>
  );
}
