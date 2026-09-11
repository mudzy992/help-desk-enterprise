import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketConfidentialBadge, TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { Button } from "@/components/ui/button";
import {
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
  ticketIdClassName,
} from "@/components/ui/control";
import { canShowClaimAction } from "@/lib/tickets/ticket-actions";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import { cn } from "@/lib/utils";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketListTableProperties {
  readonly tickets: readonly TicketResponse[];
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly claimingId: string | null;
  readonly selectedIds: ReadonlySet<string>;
  readonly onToggleSelected: (ticketId: string) => void;
  readonly onClaim: (ticketId: string) => void;
}

function assignmentLabelKey(
  ticket: TicketResponse,
): "tickets.assignment.unrouted" | "tickets.assignment.groupOnly" | "tickets.assignment.assigned" {
  if (ticket.status === "UNROUTED" || ticket.assignedGroupId === null) {
    return "tickets.assignment.unrouted";
  }
  if (ticket.assignedUserId === null) {
    return "tickets.assignment.groupOnly";
  }
  return "tickets.assignment.assigned";
}

export function TicketListTable({
  tickets,
  serviceNames,
  claimingId,
  selectedIds,
  onToggleSelected,
  onClaim,
}: TicketListTableProperties) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className={tableWrapClassName}>
      <table className="min-w-full text-left">
        <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
          <tr>
            <th className="w-10 px-3 py-2">
              <span className="sr-only">{t("tickets.bulk.select")}</span>
            </th>
            <th className="px-3 py-2">{t("tickets.columns.number")}</th>
            <th className="px-3 py-2">{t("tickets.columns.subject")}</th>
            <th className="px-3 py-2">{t("tickets.columns.status")}</th>
            <th className="hidden px-3 py-2 md:table-cell">{t("tickets.columns.priority")}</th>
            <th className="hidden px-3 py-2 lg:table-cell">{t("tickets.columns.service")}</th>
            <th className="hidden px-3 py-2 lg:table-cell">{t("tickets.columns.assignment")}</th>
            <th className="px-3 py-2 text-right">{t("tickets.columns.updated")}</th>
            <th className="px-3 py-2">
              <span className="sr-only">{t("tickets.claim")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              className={cn(tableRowClassName, "cursor-pointer")}
              onClick={() => navigate(`/tickets/${ticket.id}`)}
            >
              <td className="w-10 px-3 py-2" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(ticket.id)}
                  onChange={() => onToggleSelected(ticket.id)}
                  aria-label={t("tickets.bulk.selectRow", { number: ticket.ticketNumber })}
                />
              </td>
              <td className="px-3 py-2">
                <Link to={`/tickets/${ticket.id}`} className={ticketIdClassName}>
                  {ticket.ticketNumber}
                </Link>
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                  {ticket.isConfidential ? <TicketConfidentialBadge /> : null}
                  {ticket.title}
                </span>
              </td>
              <td className="px-3 py-2">
                <TicketStatusBadge status={ticket.status} />
              </td>
              <td className="hidden px-3 py-2 md:table-cell">
                <TicketPriorityBadge priority={ticket.priority} showCriticalMark />
              </td>
              <td className="hidden px-3 py-2 text-[12px] text-muted-foreground lg:table-cell">
                {serviceNames.get(ticket.serviceId) ?? ticket.serviceId}
              </td>
              <td className="hidden px-3 py-2 text-[12px] text-muted-foreground lg:table-cell">
                {t(assignmentLabelKey(ticket))}
              </td>
              <td className="px-3 py-2 text-right text-[12px] text-muted-foreground tnum">
                {formatTicketTimestamp(ticket.updatedAt, i18n.language)}
              </td>
              <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                {canShowClaimAction(ticket) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={claimingId === ticket.id}
                    onClick={() => onClaim(ticket.id)}
                  >
                    {claimingId === ticket.id ? t("tickets.claiming") : t("tickets.claim")}
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
