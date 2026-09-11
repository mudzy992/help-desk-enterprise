import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TicketPriority, TicketStatus } from "@/services/tickets-api";

const statusClass: Record<TicketStatus, string> = {
  PENDING: "border-warning/40 text-warning",
  UNROUTED: "border-warning/40 text-warning",
  PENDING_APPROVAL: "border-info/40 text-info",
  ASSIGNED: "border-info/40 text-info",
  IN_PROGRESS: "border-primary/40 text-primary",
  WAITING_FOR_USER: "border-warning/40 text-warning",
  RESOLVED: "border-success/40 text-success",
  CLOSED: "border-border text-muted-foreground",
  ARCHIVED: "border-border text-muted-foreground",
};

const priorityClass: Record<TicketPriority, string> = {
  LOW: "border-border text-muted-foreground",
  MEDIUM: "border-info/40 text-info",
  HIGH: "border-warning/40 text-warning",
  CRITICAL: "border-destructive/50 text-destructive",
};

interface TicketStatusBadgeProperties {
  readonly status: TicketStatus;
}

export function TicketStatusBadge({ status }: TicketStatusBadgeProperties) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border px-2 text-metadata",
        statusClass[status],
      )}
    >
      {t(`tickets.status.${status}`)}
    </span>
  );
}

interface TicketPriorityBadgeProperties {
  readonly priority: TicketPriority;
}

export function TicketPriorityBadge({ priority }: TicketPriorityBadgeProperties) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md border px-2 text-metadata",
        priorityClass[priority],
      )}
    >
      {t(`tickets.priority.${priority}`)}
    </span>
  );
}
