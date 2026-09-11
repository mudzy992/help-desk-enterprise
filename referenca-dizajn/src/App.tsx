import { useCallback, useEffect, useMemo, useState } from "react";
import { NavContext, type Route } from "./nav";
import { Shell } from "./components/Shell";
import { Dashboard } from "./pages/Dashboard";
import { TicketsPage } from "./pages/Tickets";
import { TicketDetailPage } from "./pages/TicketDetail";
import { NewTicketPage } from "./pages/NewTicket";
import { InboxPage } from "./pages/Inbox";
import { CatalogPage } from "./pages/Catalog";
import { KnowledgePage } from "./pages/Knowledge";
import { RoutingPage } from "./pages/Routing";
import { SlaPage } from "./pages/Sla";
import { AdminPage } from "./pages/Admin";
import { ReportsPage } from "./pages/Reports";

export default function App() {
  const [route, setRoute] = useState<Route>({ name: "dashboard" });

  const go = useCallback((r: Route) => {
    setRoute(r);
  }, []);

  /* Scroll na vrh pri promjeni stranice */
  useEffect(() => {
    document.querySelector("main")?.scrollTo({ top: 0 });
  }, [route]);

  /* Prečica: N = novi tiket (osim kad se kuca u polju) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (!typing && (e.key === "n" || e.key === "N") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        go({ name: "new" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const nav = useMemo(() => ({ route, go }), [route, go]);

  const pageKey =
    route.name === "ticket"
      ? `ticket-${route.id}`
      : route.name === "admin"
        ? `admin-${route.tab ?? "org"}`
        : route.name;

  return (
    <NavContext.Provider value={nav}>
      <div className="h-full min-h-0 bg-background text-text">
        <Shell>
          <div key={pageKey}>
            {route.name === "dashboard" && <Dashboard />}
            {route.name === "tickets" && <TicketsPage initialStatus={route.status} />}
            {route.name === "ticket" && <TicketDetailPage id={route.id} />}
            {route.name === "new" && <NewTicketPage />}
            {route.name === "inbox" && <InboxPage />}
            {route.name === "catalog" && <CatalogPage />}
            {route.name === "knowledge" && <KnowledgePage />}
            {route.name === "routing" && <RoutingPage />}
            {route.name === "sla" && <SlaPage />}
            {route.name === "admin" && <AdminPage tab={route.tab} />}
            {route.name === "reports" && <ReportsPage />}
          </div>
        </Shell>
      </div>
    </NavContext.Provider>
  );
}
