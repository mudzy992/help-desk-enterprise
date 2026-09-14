import { Flame, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ticketPriorityLabelKey, ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import { Badge } from "@/components/ui/badge";
import {
  SLA_STATE_META,
  TICKET_PRIORITY_META,
  TICKET_STATUS_META,
} from "@/lib/theme/semantic-meta";
import type { TicketPriority, TicketStatus } from "@/services/tickets-api";

interface TicketStatusBadgeProperties {
  readonly status: TicketStatus;
}

export function TicketStatusBadge({ status }: TicketStatusBadgeProperties) {
  const { t } = useTranslation();
  return (
    <Badge tone={TICKET_STATUS_META[status].tone} dot>
      {ticketText(t, ticketStatusLabelKey[status])}
    </Badge>
  );
}

interface TicketPriorityBadgeProperties {
  readonly priority: TicketPriority;
  readonly showCriticalMark?: boolean;
}

export function TicketPriorityBadge({
  priority,
  showCriticalMark = false,
}: TicketPriorityBadgeProperties) {
  const { t } = useTranslation();
  return (
    <Badge tone={TICKET_PRIORITY_META[priority].tone} dot>
      {showCriticalMark && priority === "CRITICAL" ? (
        <Flame size={11} strokeWidth={2} className="text-danger" aria-hidden="true" />
      ) : null}
      {ticketText(t, ticketPriorityLabelKey[priority])}
    </Badge>
  );
}

export function TicketConfidentialBadge() {
  const { t } = useTranslation();
  return (
    <Badge tone="warning">
      <ShieldAlert size={11} strokeWidth={2} aria-hidden="true" />
      {t("tickets.confidential.badge")}
    </Badge>
  );
}

export function TicketOverdueBadge() {
  const { t } = useTranslation();
  return (
    <Badge tone={SLA_STATE_META.BREACHED.tone} dot>
      {t("tickets.overdue.badge")}
    </Badge>
  );
}
