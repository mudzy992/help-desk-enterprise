import { ArrowRight, ShieldAlert } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  TicketOverdueBadge,
  TicketPauseChip,
  TicketPriorityBadge,
  TicketStatusBadge,
} from "@/components/tickets/ticket-badges";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { tableHeadClassName, ticketIdClassName } from "@/components/ui/control";
import { isTicketOverdue } from "@/lib/tickets/filter-tickets";
import type { TicketResponse } from "@/services/tickets-api";

interface DashboardAttentionTableProperties {
  readonly items: readonly TicketResponse[];
}

export function DashboardAttentionTable({
  items,
}: DashboardAttentionTableProperties) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader
        title={t("dashboard.attentionHeading")}
        subtitle={t("dashboard.attentionHint")}
        actions={
          <Button asChild size="xs" variant="ghost">
            <Link to="/tickets?view=all">
              {t("dashboard.attentionAll")} <ArrowRight size={12} />
            </Link>
          </Button>
        }
      />
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">
          {t("dashboard.attentionEmpty")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className={`border-b border-border/70 ${tableHeadClassName}`}>
                <th className="px-4 py-2.5 font-medium">
                  {t("dashboard.columnTicket")}
                </th>
                <th className="px-4 py-2.5 font-medium">
                  {t("dashboard.columnStatus")}
                </th>
                <th className="px-4 py-2.5 font-medium">
                  {t("dashboard.columnPriority")}
                </th>
                <th className="px-4 py-2.5 text-right font-medium">
                  {t("dashboard.columnOverdue")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {items.map((ticket) => (
                <tr
                  key={ticket.id}
                  className="group min-h-9 cursor-pointer transition-colors duration-150 hover:bg-elevated/40"
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {ticket.isConfidential ? (
                        <ShieldAlert
                          size={13}
                          className="shrink-0 text-warning"
                          aria-hidden="true"
                        />
                      ) : null}
                      <Link
                        to={`/tickets/${ticket.id}`}
                        className={ticketIdClassName}
                      >
                        {ticket.ticketNumber}
                      </Link>
                      <TicketPauseChip status={ticket.status} />
                    </div>
                    <p className="mt-0.5 max-w-[340px] truncate text-[12.5px] text-foreground/90">
                      {ticket.title}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <TicketStatusBadge status={ticket.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    <TicketPriorityBadge
                      priority={ticket.priority}
                      showCriticalMark
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {isTicketOverdue(ticket) ? <TicketOverdueBadge /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
