import { useTranslation } from "react-i18next";
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { Button } from "@/components/ui/button";
import { canShowClaimAction, nextTicketStatuses } from "@/lib/tickets/ticket-actions";
import type { TicketResponse, TicketStatus } from "@/services/tickets-api";

interface TicketDetailHeaderProperties {
  readonly ticket: TicketResponse;
  readonly serviceName: string;
  readonly canChangeStatus: boolean;
  readonly claiming: boolean;
  readonly savingStatus: boolean;
  readonly onClaim: () => void;
  readonly onStatusChange: (status: TicketStatus) => void;
}

export function TicketDetailHeader({
  ticket,
  serviceName,
  canChangeStatus,
  claiming,
  savingStatus,
  onClaim,
  onStatusChange,
}: TicketDetailHeaderProperties) {
  const { t } = useTranslation();
  const nextStatuses = nextTicketStatuses(ticket.status);
  return (
    <header className="border-b border-border pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-metadata text-muted-foreground">{ticket.ticketNumber}</p>
          <h2 className="mt-1 text-section font-medium text-foreground">{ticket.title}</h2>
          <p className="mt-1 text-metadata text-muted-foreground">{serviceName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TicketStatusBadge status={ticket.status} />
          <TicketPriorityBadge priority={ticket.priority} />
          {canShowClaimAction(ticket) ? (
            <Button type="button" size="sm" disabled={claiming} onClick={onClaim}>
              {claiming ? t("tickets.claiming") : t("tickets.claim")}
            </Button>
          ) : null}
        </div>
      </div>
      {canChangeStatus && nextStatuses.length > 0 ? (
        <label className="mt-3 grid max-w-xs gap-1 text-metadata text-muted-foreground">
          {t("tickets.detail.changeStatus")}
          <select
            className="h-8 rounded-md border border-input bg-surface px-2 text-metadata"
            value=""
            disabled={savingStatus}
            onChange={(event) => {
              if (event.target.value.length > 0) {
                onStatusChange(event.target.value as TicketStatus);
              }
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
    </header>
  );
}
