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
    <div className="flex flex-wrap items-center gap-2">
      <nav className="flex min-w-0 flex-1 flex-wrap gap-1" aria-label={t("tickets.title")}>
        {views.map((item) => (
          <NavLink
            key={item}
            to={item === "inbox" ? "/tickets" : `/tickets?view=${item}`}
            className={cn(
              "h-8 rounded-md px-2 text-metadata focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              view === item
                ? "bg-elevated text-foreground"
                : "text-muted-foreground hover:bg-elevated/70 hover:text-foreground",
            )}
          >
            {t(`tickets.views.${item}`)}
          </NavLink>
        ))}
      </nav>
      <NavLink
        to="/tickets/new"
        className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-metadata font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("tickets.createAction")}
      </NavLink>
    </div>
  );
}
