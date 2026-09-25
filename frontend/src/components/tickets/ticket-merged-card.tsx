import { GitMerge } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardHeader } from "@/components/ui/card";
import { ticketStatusLabelKey } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { TicketStatus } from "@/services/tickets-api";
import type { MergedTicketItem } from "@/services/tickets-merge-api";

interface TicketMergedCardProperties {
  readonly items: readonly MergedTicketItem[];
}

/** Package 1.2 (M7): children merged into this ticket (staff only). */
export function TicketMergedCard({ items }: TicketMergedCardProperties) {
  const { t, i18n } = useTranslation();
  if (items.length === 0) {
    return null;
  }
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });
  return (
    <Card className="fade-in" data-testid="ticket-merged-card">
      <CardHeader title={ticketText(t, "tickets.merge.cardTitle", { count: items.length })} />
      <ul className="divide-y divide-border/40 px-4 py-1.5 text-[12px]">
        {items.map((item) => {
          const statusKey = (ticketStatusLabelKey as Readonly<Record<TicketStatus, string>>)[item.status as TicketStatus];
          return (
            <li key={item.id} className="py-2">
              <div className="flex items-center gap-1.5">
                <GitMerge size={12} className="text-muted-foreground" aria-hidden="true" />
                <Link className="tnum font-medium text-link hover:underline" to={`/tickets/${item.id}`}>
                  {item.ticketNumber}
                </Link>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {statusKey === undefined ? item.status : ticketText(t, statusKey)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-foreground/85" title={item.title}>{item.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {[item.requesterName, item.mergedAt === null ? null : dateFormat.format(new Date(item.mergedAt))]
                  .filter((part): part is string => part !== null && part.length > 0)
                  .join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
