import { Flame, Pause, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ticketPriorityLabelKey, ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import { Badge } from "@/components/ui/badge";
import {
  SLA_STATE_META,
  TICKET_PRIORITY_META,
  TICKET_STATUS_META,
} from "@/lib/theme/semantic-meta";
import { cn } from "@/lib/utils";
import type { TicketPriority, TicketStatus } from "@/services/tickets-api";

/*
  Ticket badges all funnel through one shell: a tone-tinted pill whose colour,
  icon and (for priority) bar height carry the same meaning three times over,
  so the signal survives both a quick scan and a colour-blind reader.
*/

const PRIORITY_LEVELS: Record<TicketPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const SIGNAL_BAR_HEIGHTS = ["h-1", "h-[5px]", "h-1.5", "h-2"] as const;

function PrioritySignal({ priority }: { readonly priority: TicketPriority }) {
  const filled = PRIORITY_LEVELS[priority];
  return (
    <span className="flex items-end gap-[2px]" aria-hidden="true">
      {SIGNAL_BAR_HEIGHTS.map((height, index) => (
        <span
          key={height}
          className={cn(
            "w-[3px] rounded-full",
            height,
            index < filled ? "bg-current" : "bg-current opacity-30",
          )}
        />
      ))}
    </span>
  );
}

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
    <Badge tone={TICKET_PRIORITY_META[priority].tone}>
      <PrioritySignal priority={priority} />
      {showCriticalMark && priority === "CRITICAL" ? (
        <Flame size={11} strokeWidth={2} aria-hidden="true" />
      ) : null}
      {ticketText(t, ticketPriorityLabelKey[priority])}
    </Badge>
  );
}

export function TicketConfidentialBadge() {
  const { t } = useTranslation();
  return (
    <Badge tone="hold">
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

export function TicketAtRiskBadge() {
  const { t } = useTranslation();
  return (
    <Badge tone={SLA_STATE_META.RISK.tone} dot>
      {t("tickets.atRisk.badge")}
    </Badge>
  );
}

interface TicketPauseChipProperties {
  readonly status: TicketStatus;
}

export function TicketPauseChip({ status }: TicketPauseChipProperties) {
  const { t } = useTranslation();
  if (status !== "WAITING_FOR_USER" && status !== "PENDING_APPROVAL") {
    return null;
  }
  return (
    <Badge tone="warning" className="px-1.5">
      <Pause size={9} aria-hidden="true" />
      {t("tickets.detail.pauseBadge")}
    </Badge>
  );
}
