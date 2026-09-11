import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ticketWorkspaceViews, type TicketWorkspaceView } from "@/lib/tickets/ticket-constants";
import { cn } from "@/lib/utils";

interface TicketWorkspaceNavProperties {
  readonly view: TicketWorkspaceView;
  readonly inboxHidden: boolean;
}

export function TicketWorkspaceNav({
  view,
  inboxHidden,
}: TicketWorkspaceNavProperties) {
  const { t } = useTranslation();
  const views = ticketWorkspaceViews.filter(
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
            "relative flex h-[38px] items-center whitespace-nowrap rounded-t-md px-3 text-[12.5px] font-medium transition-colors duration-150",
            view === item
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(`tickets.views.${item}`)}
          {view === item ? (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}
