import { ArrowRight, ShieldAlert } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  TicketAtRiskBadge,
  TicketOverdueBadge,
  TicketPauseChip,
  TicketPriorityBadge,
  TicketStatusBadge,
} from "@/components/tickets/ticket-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  tableHeadClassName,
  tableRowClassName,
  ticketIdClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { isTicketOverdue } from "@/lib/tickets/filter-tickets";
import { pickName } from "@/lib/tickets/ticket-names";
import type { TicketResponse } from "@/services/tickets-api";

interface DashboardAttentionTableProperties {
  readonly items: readonly TicketResponse[];
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly originNames: ReadonlyMap<string, string>;
}

function AttentionAssignmentCell({ ticket }: { readonly ticket: TicketResponse }) {
  const { t } = useTranslation();
  if (ticket.status === "UNROUTED" || ticket.assignedGroupId === null) {
    return <Badge tone="danger">{t("tickets.assignment.unrouted")}</Badge>;
  }
  const groupName = pickName(ticket.assignedGroupName) ?? t("tickets.detail.unknownGroup");
  if (ticket.assignedUserId === null) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="tnum text-[12px] text-foreground/80">
          {groupName}
        </span>
        <Badge tone="info" dot={false}>
          {t("tickets.assignment.groupOnly")}
        </Badge>
      </div>
    );
  }
  return (
    <span className="text-[12px] text-foreground/80">
      {t("tickets.assignment.assigned")}
    </span>
  );
}

export function DashboardAttentionTable({
  items,
  serviceNames,
  originNames,
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
        <EmptyState
          title={t("dashboard.attentionEmpty")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/tickets?view=all">{t("dashboard.attentionAll")}</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className={`border-b border-border/70 ${tableHeadClassName}`}>
                <th className="px-4 py-2.5 font-medium">
                  {t("dashboard.columnTicket")}
                </th>
                <th className="px-4 py-2.5 font-medium">
                  {t("dashboard.columnService")}
                </th>
                <th className="px-4 py-2.5 font-medium">
                  {t("dashboard.columnOrigin")}
                </th>
                <th className="px-4 py-2.5 font-medium">
                  {t("dashboard.columnStatus")}
                </th>
                <th className="px-4 py-2.5 font-medium">
                  {t("dashboard.columnPriority")}
                </th>
                <th className="px-4 py-2.5 font-medium">
                  {t("dashboard.columnAssignment")}
                </th>
                <th className="px-4 py-2.5 text-right font-medium">
                  {t("dashboard.columnOverdue")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((ticket) => (
                <tr
                  key={ticket.id}
                  className={`${tableRowClassName} cursor-pointer`}
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
                    </div>
                    <p className="mt-0.5 max-w-[320px] truncate text-[12.5px] text-foreground/90">
                      {ticket.title}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                    {serviceNames.get(ticket.serviceId) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground">
                    {originNames.get(ticket.originUnitId) ?? "—"}
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
                  <td className="px-4 py-2.5">
                    <AttentionAssignmentCell ticket={ticket} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      {isTicketOverdue(ticket) ? <TicketOverdueBadge /> : null}
                      {ticket.isOverdue !== true && ticket.isAtRisk === true ? (
                        <TicketAtRiskBadge />
                      ) : null}
                      <TicketPauseChip status={ticket.status} />
                    </span>
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
