import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { ticketViewLabelKey, workspaceViewsFor, type TicketWorkspaceView } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import type { SidebarTicketCounts } from "@/lib/tickets/count-sidebar-ticket-badges";
import { cn } from "@/lib/utils";

interface TicketWorkspaceNavProperties {
  readonly view: TicketWorkspaceView;
  readonly inboxHidden: boolean;
  readonly isStaff: boolean;
  /** Paket 5.3.1 (D10): the inbox badge lives on its tab (and on the sidebar item). */
  readonly counts?: SidebarTicketCounts | null;
}

/** Explicit `?view=` for every tab so a shared link always lands on the same tab. */
export function ticketWorkspaceViewPath(view: TicketWorkspaceView): string {
  return `/tickets?view=${view}`;
}

export function TicketWorkspaceNav({
  view,
  inboxHidden,
  isStaff,
  counts = null,
}: TicketWorkspaceNavProperties) {
  const { t } = useTranslation();
  const views = workspaceViewsFor(isStaff).filter(
    (item) => !(inboxHidden && item === "inbox"),
  );

  return (
    <nav
      className="flex items-center gap-1 overflow-x-auto border-b border-border/70"
      aria-label={t("tickets.title")}
      data-testid="ticket-workspace-nav"
    >
      {views.map((item) => {
        const inboxCount = item === "inbox" ? counts?.inboxBadgeCount ?? 0 : 0;
        return (
          <NavLink
            key={item}
            to={ticketWorkspaceViewPath(item)}
            aria-current={view === item ? "page" : undefined}
            data-testid={`ticket-view-${item}`}
            className={cn(
              "relative flex h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70",
              view === item
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {ticketText(t, ticketViewLabelKey[item])}
            {inboxCount > 0 ? (
              <>
                <span className="sr-only">{t("tickets.inboxBadgeLabel", { count: inboxCount })}</span>
                <span aria-hidden="true">
                  <Badge
                    tone={(counts?.unroutedCount ?? 0) > 0 ? "danger" : "primary"}
                    className="px-1.5 py-0 text-[10.5px] font-normal leading-4 tnum"
                  >
                    {inboxCount}
                  </Badge>
                </span>
              </>
            ) : null}
            {view === item ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            ) : null}
          </NavLink>
        );
      })}
    </nav>
  );
}
