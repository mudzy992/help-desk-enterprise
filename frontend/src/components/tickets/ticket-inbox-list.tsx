import { Clock3, Flame, UserCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { TicketPriorityBadge, TicketStatusBadge } from "@/components/tickets/ticket-badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ticketIdClassName } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/relative-time";
import { canShowClaimAction } from "@/lib/tickets/ticket-actions";
import { cn } from "@/lib/utils";
import type { TicketResponse } from "@/services/tickets-api";

interface TicketInboxListProperties {
  readonly tickets: readonly TicketResponse[];
  readonly serviceNames: ReadonlyMap<string, string>;
  readonly claimingId: string | null;
  readonly onClaim: (ticketId: string) => void;
}

export function TicketInboxList({
  tickets,
  serviceNames,
  claimingId,
  onClaim,
}: TicketInboxListProperties) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  return (
    <Card>
      <ul className="divide-y divide-border/50">
        {tickets.map((ticket) => (
          <li
            key={ticket.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-elevated/40 sm:flex-nowrap"
          >
            {ticket.priority === "CRITICAL" ? (
              <Flame size={15} className="shrink-0 text-danger" aria-hidden="true" />
            ) : (
              <span className="size-[15px] shrink-0 rounded-full border-2 border-border" />
            )}
            <button
              type="button"
              onClick={() => navigate(`/tickets/${ticket.id}`)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="flex items-center gap-2">
                <span className={ticketIdClassName}>
                  {ticket.ticketNumber}
                </span>
                <span className="truncate text-[13px] font-medium text-foreground/95">
                  {ticket.title}
                </span>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>{serviceNames.get(ticket.serviceId) ?? ticket.serviceId}</span>
                <span className="text-border">·</span>
                <span>
                  <RelativeTime value={ticket.createdAt} locale={i18n.language} />
                </span>
              </p>
            </button>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <TicketStatusBadge status={ticket.status} />
              <TicketPriorityBadge priority={ticket.priority} />
              <span
                className={cn(
                  "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px]",
                  "border-border bg-background/60 text-muted-foreground",
                )}
              >
                <Clock3 size={10} aria-hidden="true" />
                <RelativeTime value={ticket.updatedAt} locale={i18n.language} />
              </span>
            </div>
            {canShowClaimAction(ticket) ? (
              <Button
                variant={ticket.priority === "CRITICAL" ? "default" : "outline"}
                size="sm"
                disabled={claimingId === ticket.id}
                onClick={() => onClaim(ticket.id)}
              >
                <UserCheck size={13} />
                {claimingId === ticket.id ? t("tickets.claiming") : t("tickets.claim")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
