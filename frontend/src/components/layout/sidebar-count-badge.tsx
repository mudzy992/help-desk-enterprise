import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import {
  navigationLabelKeys,
  type NavigationItem,
} from "@/lib/navigation";
import type { SidebarTicketCounts } from "@/lib/tickets/count-sidebar-ticket-badges";

const sidebarCountBadgeClassName =
  "px-1.5 py-0 text-[10.5px] font-normal leading-4 tnum";

interface SidebarCountBadgeProperties {
  readonly item: NavigationItem;
  readonly ticketCounts: SidebarTicketCounts | null;
}

/**
 * Paket 5.3.1 (D10): the group inbox is a tab of "All tickets", so its badge
 * moved here — the neutral count is open tickets, the second (danger while
 * something is unrouted) is what waits in the group inbox.
 */
export function SidebarCountBadge({
  item,
  ticketCounts,
}: SidebarCountBadgeProperties) {
  const { t } = useTranslation();
  if (ticketCounts === null || item.labelKey !== navigationLabelKeys.tickets) {
    return null;
  }
  const inbox = ticketCounts.inboxBadgeCount;
  const open = ticketCounts.openTicketCount;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="sr-only">
        {inbox > 0 ? `${t("tickets.inboxBadgeLabel", { count: inbox })}, ` : null}
        {t("tickets.openBadgeLabel", { count: open })}
      </span>
      {inbox > 0 ? (
        <span aria-hidden="true" data-testid="sidebar-inbox-badge" title={t("tickets.inboxBadgeLabel", { count: inbox })}>
          <Badge tone={ticketCounts.unroutedCount > 0 ? "danger" : "primary"} className={sidebarCountBadgeClassName}>
            {inbox}
          </Badge>
        </span>
      ) : null}
      <span aria-hidden="true" title={t("tickets.openBadgeLabel", { count: open })}>
        <Badge tone="neutral" className={sidebarCountBadgeClassName}>
          {open}
        </Badge>
      </span>
    </span>
  );
}
