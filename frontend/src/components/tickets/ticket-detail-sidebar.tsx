import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { formatTicketTimestamp, truncateIdentifier } from "@/lib/tickets/ticket-display";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketDetailSidebarProperties {
  readonly ticket: TicketResponse;
  readonly originName: string;
}

export function TicketDetailSidebar({ ticket, originName }: TicketDetailSidebarProperties) {
  const { t, i18n } = useTranslation();
  const rows = [
    [t("tickets.detail.requester"), truncateIdentifier(ticket.requesterId)],
    [t("tickets.detail.assignee"), truncateIdentifier(ticket.assignedUserId)],
    [t("tickets.detail.group"), truncateIdentifier(ticket.assignedGroupId)],
    [t("tickets.detail.origin"), originName],
    [t("tickets.split.parent"), ticket.parentTicketId ? truncateIdentifier(ticket.parentTicketId) : "—"],
    [t("tickets.impact"), t(`tickets.severity.${ticket.impact}`)],
    [t("tickets.urgency"), t(`tickets.severity.${ticket.urgency}`)],
    [t("tickets.detail.classification"), ticket.classification],
    [t("tickets.detail.created"), formatTicketTimestamp(ticket.createdAt, i18n.language)],
    [t("tickets.detail.updated"), formatTicketTimestamp(ticket.updatedAt, i18n.language)],
  ] as const;
  return (
    <Card className="px-4 py-3.5">
      <dl className="grid gap-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-0.5 text-[13px] text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
