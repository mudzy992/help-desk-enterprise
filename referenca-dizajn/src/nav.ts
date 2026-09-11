import { createContext, useContext } from "react";

export type AdminTab = "org" | "users" | "settings" | "ops";

export type Route =
  | { name: "dashboard" }
  | { name: "tickets"; status?: string }
  | { name: "ticket"; id: string }
  | { name: "new" }
  | { name: "inbox" }
  | { name: "catalog" }
  | { name: "knowledge" }
  | { name: "routing" }
  | { name: "sla" }
  | { name: "admin"; tab?: AdminTab }
  | { name: "reports" };

export interface Nav {
  route: Route;
  go: (r: Route) => void;
}

export const NavContext = createContext<Nav>({
  route: { name: "dashboard" },
  go: () => {},
});

export const useNav = () => useContext(NavContext);

/** String rute iz obavještenja → Route objekat */
export function routeFromString(s?: string): Route | null {
  if (!s) return null;
  if (s.startsWith("ticket:")) return { name: "ticket", id: s.slice(7) };
  if (s.startsWith("admin:")) return { name: "admin", tab: s.slice(6) as AdminTab };
  if (s === "inbox") return { name: "inbox" };
  if (s === "routing") return { name: "routing" };
  return null;
}
