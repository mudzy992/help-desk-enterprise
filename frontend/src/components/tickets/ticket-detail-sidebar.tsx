import { useTranslation } from "react-i18next";
import { TicketPriorityBadge } from "@/components/tickets/ticket-badges";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import {
  ticketAssigneeName,
  ticketGroupName,
  ticketRequesterName,
} from "@/lib/tickets/ticket-names";
import { ticketSeverityLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { TicketResponse } from "@/services/tickets-api";
import type { ReactNode } from "react";

interface TicketDetailSidebarProperties {
  readonly ticket: TicketResponse;
  readonly originName: string;
  readonly serviceName: string;
  readonly authorNames: ReadonlyMap<string, string>;
  readonly groupNames: ReadonlyMap<string, string>;
}

export function TicketDetailSidebar({
  ticket,
  originName,
  serviceName,
  authorNames,
  groupNames,
}: TicketDetailSidebarProperties) {
  const { t } = useTranslation();
  const requester =
    ticketRequesterName(ticket, authorNames) ?? t("tickets.detail.unknownUser");
  const assignee =
    ticket.assignedUserId === null
      ? null
      : (ticketAssigneeName(ticket, authorNames) ?? t("tickets.detail.unknownUser"));
  const group =
    ticketGroupName(ticket, groupNames) ?? t("tickets.detail.unknownGroup");
  const rows: readonly { readonly label: string; readonly value: ReactNode; readonly hint?: string }[] = [
    { label: t("tickets.detail.service"), value: serviceName },
    {
      label: t("tickets.detail.formVersion"),
      value: (
        <span className="tnum text-muted-foreground">
          {ticket.formVersionNumber === null || ticket.formVersionNumber === undefined
            ? "—"
            : t("tickets.detail.formVersionValue", { version: ticket.formVersionNumber })}
        </span>
      ),
      hint: t("tickets.detail.formVersionFixed"),
    },
    { label: t("tickets.detail.origin"), value: originName },
    {
      label: t("tickets.detail.group"),
      value:
        ticket.status === "UNROUTED" || ticket.assignedGroupId === null ? (
          <Badge tone="danger">{t("tickets.detail.unrouted")}</Badge>
        ) : (
          group
        ),
    },
    {
      label: t("tickets.detail.assignee"),
      value: assignee ? (
        <span className="flex items-center justify-end gap-1.5">
          <Avatar name={assignee} size="xs" /> {assignee}
        </span>
      ) : (
        <span className="text-muted-foreground">{t("tickets.detail.unassigned")}</span>
      ),
    },
    {
      label: t("tickets.detail.requester"),
      value: (
        <span className="flex items-center justify-end gap-1.5">
          <Avatar name={requester} size="xs" /> {requester}
        </span>
      ),
    },
    {
      label: t("tickets.detail.impactUrgency"),
      value: `${ticketText(t, ticketSeverityLabelKey[ticket.impact])} × ${ticketText(t, ticketSeverityLabelKey[ticket.urgency])}`,
      hint: t("tickets.detail.priorityFromMatrix"),
    },
    {
      label: t("tickets.filters.priority"),
      value: <TicketPriorityBadge priority={ticket.priority} />,
    },
  ];
  return (
    <Card className="fade-in">
      <CardHeader title={t("tickets.detail.properties")} />
      <dl className="divide-y divide-border/40 px-4 py-1.5 text-[12px]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 py-2.5">
            <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
            <dd className="text-right text-foreground/90">
              {row.value}
              {row.hint ? (
                <p className="text-[10.5px] text-muted-foreground/60">{row.hint}</p>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
