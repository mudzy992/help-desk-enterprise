import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ticketViewLabelKey, workspaceViewsFor, type TicketWorkspaceView } from "@/lib/tickets/ticket-constants";
import { ticketText } from "@/lib/tickets/ticket-text";
import { cn } from "@/lib/utils";

interface TicketWorkspaceNavProperties {
  readonly view: TicketWorkspaceView;
  readonly inboxHidden: boolean;
  readonly isStaff: boolean;
}

export function TicketWorkspaceNav({
  view,
  inboxHidden,
  isStaff,
}: TicketWorkspaceNavProperties) {
  const { t } = useTranslation();
  const views = workspaceViewsFor(isStaff).filter(
    (item) => !(inboxHidden && item === "inbox"),
  );

  return (
    <nav
      className="flex items-center gap-1 overflow-x-auto border-b border-border/70"
      aria-label={t("tickets.title")}
    >
      {views.map((item) => (
        <NavLink
          key={item}
          to={item === "inbox" ? "/tickets" : `/tickets?view=${item}`}
          className={cn(
            "relative flex h-[38px] items-center whitespace-nowrap rounded-t-md px-3 text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/70",
            view === item
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {ticketText(t, ticketViewLabelKey[item])}
          {view === item ? (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}
