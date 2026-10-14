import { GitMerge } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DetailSection } from "@/components/ui/detail-section";
import { TicketErrorState } from "@/components/tickets/ticket-feedback-states";
import type { TicketErrorKey } from "@/lib/tickets/map-ticket-error";
import { ticketStatusTranslationKey } from "@/lib/tickets/ticket-constants";
import type { MergedTicketItem } from "@/services/tickets-merge-api";

interface TicketMergedCardProperties {
  readonly items: readonly MergedTicketItem[];
  readonly errorKey?: TicketErrorKey | null;
  readonly onRetry?: () => void;
}

/** Package 1.2 (M7): children merged into this ticket (staff only). */
export function TicketMergedCard({ items, errorKey = null, onRetry }: TicketMergedCardProperties) {
  const { t, i18n } = useTranslation();
  if (errorKey !== null) {
    return (
      <div data-testid="ticket-merged-error">
        <TicketErrorState errorKey={errorKey} onRetry={onRetry} />
      </div>
    );
  }
  if (items.length === 0) {
    return null;
  }
  const dateFormat = new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "bs-BA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return (
    <DetailSection
      id="merged"
      testId="ticket-merged-card"
      title={t("tickets.merge.cardTitle", { count: items.length })}
    >
      <ul className="divide-y divide-border/40 text-[12px]">
        {items.map((item) => {
          const statusKey = ticketStatusTranslationKey(item.status);
          return (
            <li key={item.id} className="py-2">
              <div className="flex items-center gap-1.5">
                <GitMerge size={12} className="text-muted-foreground" aria-hidden="true" />
                <Link
                  className="tnum font-medium text-link hover:underline"
                  to={`/tickets/${item.id}`}
                >
                  {item.ticketNumber}
                </Link>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {statusKey === null ? item.status : t(statusKey)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-foreground/85" title={item.title}>
                {item.title}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {[
                  item.requesterName,
                  item.mergedAt === null ? null : dateFormat.format(new Date(item.mergedAt)),
                ]
                  .filter((part): part is string => part !== null && part.length > 0)
                  .join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </DetailSection>
  );
}
