import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  TicketPriorityBadge,
  TicketStatusBadge,
} from "@/components/tickets/ticket-badges";
import {
  tableHeadClassName,
  tableRowClassName,
  ticketIdClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import type { TicketResponse } from "@/services/tickets-api";

interface DashboardRecentTicketsProperties {
  readonly items: readonly TicketResponse[];
}

export function DashboardRecentTickets({
  items,
}: DashboardRecentTicketsProperties) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <EmptyState
        title={t("dashboard.recentEmptyTitle")}
        body={t("dashboard.recentEmptyBody")}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <thead className={`border-b border-border/70 ${tableHeadClassName}`}>
          <tr>
            <th className="px-3 py-2">{t("dashboard.columnTicket")}</th>
            <th className="px-3 py-2">{t("dashboard.columnTitle")}</th>
            <th className="px-3 py-2">{t("dashboard.columnStatus")}</th>
            <th className="px-3 py-2">{t("dashboard.columnPriority")}</th>
            <th className="px-3 py-2">{t("dashboard.columnCreated")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((ticket) => (
            <tr
              key={ticket.id}
              className={`${tableRowClassName} cursor-pointer`}
              onClick={() => navigate(`/tickets/${ticket.id}`)}
            >
              <td className="px-3">
                <Link to={`/tickets/${ticket.id}`} className={ticketIdClassName}>
                  {ticket.ticketNumber}
                </Link>
              </td>
              <td className="max-w-[26rem] truncate px-3 text-[13px] font-medium">
                {ticket.title}
              </td>
              <td className="px-3">
                <TicketStatusBadge status={ticket.status} />
              </td>
              <td className="px-3">
                <TicketPriorityBadge priority={ticket.priority} showCriticalMark />
              </td>
              <td className="px-3 tnum text-[12px] text-muted-foreground">
                {new Date(ticket.createdAt).toLocaleString(i18n.language)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
