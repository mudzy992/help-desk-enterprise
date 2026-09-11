import { useTranslation } from "react-i18next";
import { formatTicketTimestamp, truncateIdentifier } from "@/lib/tickets/ticket-display";
import { Separator } from "@/components/ui/separator";
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
    [t("tickets.impact"), t(`tickets.severity.${ticket.impact}`)],
    [t("tickets.urgency"), t(`tickets.severity.${ticket.urgency}`)],
    [t("tickets.detail.classification"), ticket.classification],
    [t("tickets.detail.created"), formatTicketTimestamp(ticket.createdAt, i18n.language)],
    [t("tickets.detail.updated"), formatTicketTimestamp(ticket.updatedAt, i18n.language)],
  ] as const;
  return (
    <aside className="grid gap-3 lg:max-w-xs">
      {rows.map(([label, value]) => (
        <div key={label}>
          <p className="text-metadata text-muted-foreground">{label}</p>
          <p className="text-body text-foreground">{value}</p>
        </div>
      ))}
      <Separator />
    </aside>
  );
}
