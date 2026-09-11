import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { Button } from "@/components/ui/button";
import { canShowClaimAction } from "@/lib/tickets/ticket-actions";
import { formatTicketTimestamp } from "@/lib/tickets/ticket-display";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketListTableProperties {
  readonly tickets: readonly TicketResponse[];
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly claimingId: string | null;
  readonly onClaim: (ticketId: string) => void;
}

function assignmentLabelKey(ticket: TicketResponse): "tickets.assignment.unrouted" | "tickets.assignment.groupOnly" | "tickets.assignment.assigned" {
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
  onClaim,
}: TicketListTableProperties) {
  const { t, i18n } = useTranslation();
  return (
    <div className="mt-3 overflow-x-auto border border-border">
      <table className="min-w-full text-left">
        <thead className="border-b border-border bg-elevated/50 text-metadata text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t("tickets.columns.number")}</th>
            <th className="px-3 py-2 font-medium">{t("tickets.columns.subject")}</th>
            <th className="px-3 py-2 font-medium">{t("tickets.columns.status")}</th>
            <th className="hidden px-3 py-2 font-medium md:table-cell">
              {t("tickets.columns.priority")}
            </th>
            <th className="hidden px-3 py-2 font-medium lg:table-cell">
              {t("tickets.columns.service")}
            </th>
            <th className="hidden px-3 py-2 font-medium lg:table-cell">
              {t("tickets.columns.assignment")}
            </th>
            <th className="px-3 py-2 font-medium">{t("tickets.columns.updated")}</th>
            <th className="px-3 py-2 font-medium">
              <span className="sr-only">{t("tickets.claim")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="align-top">
              <td className="px-3 py-2 text-metadata text-muted-foreground">
                {ticket.ticketNumber}
              </td>
              <td className="px-3 py-2">
                <Link
                  to={`/tickets/${ticket.id}`}
                  className="text-body font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {ticket.title}
                </Link>
              </td>
              <td className="px-3 py-2">
                <TicketStatusBadge status={ticket.status} />
              </td>
              <td className="hidden px-3 py-2 md:table-cell">
                <TicketPriorityBadge priority={ticket.priority} />
              </td>
              <td className="hidden px-3 py-2 text-metadata text-muted-foreground lg:table-cell">
                {serviceNames.get(ticket.serviceId) ?? ticket.serviceId}
              </td>
              <td className="hidden px-3 py-2 text-metadata text-muted-foreground lg:table-cell">
                {t(assignmentLabelKey(ticket))}
              </td>
              <td className="px-3 py-2 text-metadata text-muted-foreground">
                {formatTicketTimestamp(ticket.updatedAt, i18n.language)}
              </td>
              <td className="px-3 py-2">
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
