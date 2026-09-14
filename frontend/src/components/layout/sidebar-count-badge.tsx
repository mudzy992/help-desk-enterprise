import { Badge } from "@/components/ui/badge";
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

export function SidebarCountBadge({
  item,
  ticketCounts,
}: SidebarCountBadgeProperties) {
  if (ticketCounts === null) {
    return null;
  }
  if (item.labelKey === navigationLabelKeys.tickets) {
    return (
      <Badge tone="neutral" className={sidebarCountBadgeClassName}>
        {ticketCounts.openTicketCount}
      </Badge>
    );
  }
  if (item.labelKey === navigationLabelKeys.inbox) {
    return (
      <Badge
        tone={ticketCounts.unroutedCount > 0 ? "danger" : "neutral"}
        className={sidebarCountBadgeClassName}
      >
        {ticketCounts.inboxBadgeCount}
      </Badge>
    );
  }
  return null;
}
