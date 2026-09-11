import { Flame } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { TicketPriority, TicketStatus } from "@/services/tickets-api";

const statusTone: Record<TicketStatus, BadgeTone> = {
  PENDING: "info",
  UNROUTED: "danger",
  PENDING_APPROVAL: "warning",
  ASSIGNED: "primary",
  IN_PROGRESS: "primary",
  WAITING_FOR_USER: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
  ARCHIVED: "neutral",
};

const priorityTone: Record<TicketPriority, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  CRITICAL: "danger",
};

interface TicketStatusBadgeProperties {
  readonly status: TicketStatus;
}

export function TicketStatusBadge({ status }: TicketStatusBadgeProperties) {
  const { t } = useTranslation();
  return (
    <Badge tone={statusTone[status]} dot>
      {t(`tickets.status.${status}`)}
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
    <Badge tone={priorityTone[priority]} dot>
      {showCriticalMark && priority === "CRITICAL" ? (
        <Flame size={11} strokeWidth={2} className="text-danger" aria-hidden="true" />
      ) : null}
      {t(`tickets.priority.${priority}`)}
    </Badge>
  );
}
