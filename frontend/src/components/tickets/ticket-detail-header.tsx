import { useTranslation } from "react-i18next";
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { Button } from "@/components/ui/button";
import { controlClassName, labelClassName } from "@/components/ui/control";
import { PageHeader } from "@/components/ui/page-header";
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
            {canShowClaimAction(ticket) ? (
              <Button type="button" size="sm" disabled={claiming} onClick={onClaim}>
                {claiming ? t("tickets.claiming") : t("tickets.claim")}
              </Button>
            ) : null}
          </div>
        }
      />
      {canChangeStatus && nextStatuses.length > 0 ? (
        <label className={`mt-1 max-w-xs ${labelClassName}`}>
          {t("tickets.detail.changeStatus")}
          <select
            className={controlClassName}
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
