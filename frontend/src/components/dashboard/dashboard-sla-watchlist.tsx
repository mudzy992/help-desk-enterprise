import { ArrowRight, Hourglass } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  TicketOverdueBadge,
  TicketPauseChip,
} from "@/components/tickets/ticket-badges";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ticketIdClassName } from "@/components/ui/control";
import { SLA_STATE_META } from "@/lib/theme/semantic-meta";
import type { TicketResponse } from "@/services/tickets-api";

interface DashboardSlaWatchlistProperties {
  readonly items: readonly TicketResponse[];
}

export function DashboardSlaWatchlist({
  items,
}: DashboardSlaWatchlistProperties) {
  const { t } = useTranslation();

  return (
    <Card className="fade-in">
      <CardHeader
        title={t("dashboard.slaTitle")}
        subtitle={t("dashboard.slaSubtitle")}
        actions={
          <Button asChild size="xs" variant="ghost">
            <Link to="/tickets?view=all&overdue=true">
              {t("dashboard.slaAll")} <ArrowRight size={12} />
            </Link>
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title={t("dashboard.slaEmpty")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/tickets?view=all&overdue=true">
                {t("dashboard.slaAll")}
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border/50">
          {items.map((ticket) => (
            <li key={ticket.id}>
              <Link
                to={`/tickets/${ticket.id}`}
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover"
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: SLA_STATE_META.BREACHED.dot }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={ticketIdClassName}>{ticket.ticketNumber}</span>
                    <span className="truncate text-[12.5px] text-foreground/90">
                      {ticket.title}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Hourglass size={10.5} aria-hidden="true" />
                    <TicketOverdueBadge />
                    <TicketPauseChip status={ticket.status} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
