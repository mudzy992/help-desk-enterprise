import { useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  Command,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Menu,
  Plus,
  Route as RouteIcon,
  Search,
  Settings2,
  ShieldCheck,
  Timer,
  Ticket,
  UserCog,
  X,
} from "lucide-react";
import { cn } from "../utils/cn";
import { routeFromString, useNav, type Route } from "../nav";
import { Avatar, Badge, Kbd } from "./ui";
import { CURRENT_USER, GROUPS, NOTIFICATIONS, TICKETS } from "../data/mock";
import { timeAgo } from "../lib/core";

/* ---------------------------------------------------------------- */
/* Navigacija                                                        */
/* ---------------------------------------------------------------- */

interface NavItem {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  route: Route;
  badge?: number;
  badgeTone?: "neutral" | "danger" | "primary";
  match: (r: Route) => boolean;
}

const inboxTotal = GROUPS.reduce((s, g) => s + g.inboxCount, 0);
const unroutedCount = TICKETS.filter((t) => t.groupId === null && t.status !== "CLOSED" && t.status !== "RESOLVED").length;
const openTickets = TICKETS.filter((t) => t.status !== "CLOSED" && t.status !== "RESOLVED").length;

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Pregled",
    items: [
      { key: "dash", label: "Nadzorna ploča", icon: LayoutDashboard, route: { name: "dashboard" }, match: (r) => r.name === "dashboard" },
      { key: "reports", label: "Izvještaji", icon: BarChart3, route: { name: "reports" }, match: (r) => r.name === "reports" },
    ],
  },
  {
    label: "Tiketi",
    items: [
      { key: "tickets", label: "Svi tiketi", icon: Ticket, route: { name: "tickets" }, badge: openTickets, match: (r) => r.name === "tickets" || r.name === "ticket" },
      { key: "inbox", label: "Grupni inbox", icon: Inbox, route: { name: "inbox" }, badge: inboxTotal + unroutedCount, match: (r) => r.name === "inbox" },
    ],
  },
  {
    label: "Usluge i znanje",
    items: [
      { key: "catalog", label: "Katalog usluga", icon: LayoutGrid, route: { name: "catalog" }, match: (r) => r.name === "catalog" },
      { key: "kb", label: "Baza znanja", icon: BookOpen, route: { name: "knowledge" }, match: (r) => r.name === "knowledge" },
    ],
  },
  {
    label: "Administracija",
    items: [
      { key: "routing", label: "Usmjeravanje", icon: RouteIcon, route: { name: "routing" }, match: (r) => r.name === "routing" },
      { key: "sla", label: "SLA pravila", icon: Timer, route: { name: "sla" }, match: (r) => r.name === "sla" },
      { key: "admin", label: "Administracija", icon: Settings2, route: { name: "admin" }, match: (r) => r.name === "admin" },
    ],
  },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { route, go } = useNav();
  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border/70 px-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
          <LifeBuoy size={17} strokeWidth={2} />
        </span>
        <div className="leading-tight">
          <p className="text-[13.5px] font-semibold tracking-tight text-text">EP-HelpDesk</p>
          <p className="text-[10.5px] text-muted/80">Enterprise servisni centar</p>
        </div>
        <Badge tone="neutral" className="ml-auto text-[9.5px] px-1">v0.4</Badge>
      </div>

      {/* Novi tiket */}
      <div className="px-3 pt-3">
        <button
          onClick={() => {
            go({ name: "new" });
            onNavigate?.();
          }}
          className={cn(
            "flex h-9 w-full items-center justify-center gap-2 rounded-md border text-[13px] font-medium transition-colors",
            route.name === "new"
              ? "bg-[#1D4FD8] border-primary text-white"
              : "bg-primary border-primary text-white hover:bg-[#1D4FD8]"
          )}
        >
          <Plus size={15} strokeWidth={2.2} />
          Novi tiket
          <span className="ml-1 opacity-70">
            <Kbd>N</Kbd>
          </span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_SECTIONS.map((sec) => (
          <div key={sec.label} className="mb-4">
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/60">
              {sec.label}
            </p>
            <ul className="space-y-0.5">
              {sec.items.map((it) => {
                const active = it.match(route);
                const Icon = it.icon;
                return (
                  <li key={it.key}>
                    <button
                      onClick={() => {
                        go(it.route);
                        onNavigate?.();
                      }}
                      className={cn(
                        "group relative flex h-8.5 w-full items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
                        active ? "bg-elevated text-text font-medium" : "text-muted hover:bg-elevated/60 hover:text-text"
                      )}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-full bg-primary" />}
                      <Icon size={15.5} strokeWidth={1.9} className={active ? "text-[#7FA8F5]" : "text-muted/80 group-hover:text-muted"} />
                      <span className="flex-1 text-left truncate">{it.label}</span>
                      {typeof it.badge === "number" && (
                        <span
                          className={cn(
                            "rounded-md border px-1.5 py-0 text-[10.5px] tnum leading-4",
                            it.badgeTone === "danger" && "border-danger/40 bg-danger/10 text-danger",
                            !it.badgeTone && "border-border bg-background/60 text-muted",
                            it.badgeTone === "primary" && "border-primary/40 bg-primary/15 text-[#7FA8F5]"
                          )}
                        >
                          {it.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Korisnik */}
      <div className="border-t border-border/70 p-3">
        <div className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-elevated/60 transition-colors cursor-pointer">
          <Avatar name={CURRENT_USER.name} size="md" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[12.5px] font-medium text-text">{CURRENT_USER.name}</p>
            <p className="flex items-center gap-1 text-[10.5px] text-muted">
              <ShieldCheck size={11} className="text-[#7FA8F5]" />
              {CURRENT_USER.role} · lokalni nalog
            </p>
          </div>
          <LogOut size={14} className="text-muted/60 hover:text-muted" />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Obavještenja                                                      */
/* ---------------------------------------------------------------- */

const NOTIF_ICON: Record<string, typeof Bell> = {
  ticket: Ticket,
  sla: Timer,
  approval: UserCog,
  system: Settings2,
};

function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { go } = useNav();
  const [read, setRead] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const items = useMemo(() => {
    const list = NOTIFICATIONS.map((n) => ({ ...n, unread: n.unread && !read.has(n.id) }));
    return filter === "unread" ? list.filter((n) => n.unread) : list;
  }, [read, filter]);

  const unreadCount = NOTIFICATIONS.filter((n) => n.unread && !read.has(n.id)).length;

  return (
    <div className="pop-in absolute right-0 top-11 z-50 w-[380px] overflow-hidden rounded-lg border border-border bg-elevated shadow-xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-border/70 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-text">Obavještenja</p>
          {unreadCount > 0 && <Badge tone="primary">{unreadCount} nove</Badge>}
        </div>
        <div className="flex items-center gap-2 text-[11.5px]">
          <button
            onClick={() => setFilter(filter === "all" ? "unread" : "all")}
            className={cn("rounded-md px-2 py-1 transition-colors", filter === "unread" ? "bg-background text-text" : "text-muted hover:text-text")}
          >
            {filter === "unread" ? "Nepročitane" : "Sve"}
          </button>
          <button
            onClick={() => setRead(new Set(NOTIFICATIONS.map((n) => n.id)))}
            className="rounded-md px-2 py-1 text-muted transition-colors hover:text-text"
          >
            Označi sve
          </button>
        </div>
      </div>
      <ul className="max-h-[380px] overflow-y-auto">
        {items.map((n) => {
          const Icon = NOTIF_ICON[n.kind];
          return (
            <li key={n.id}>
              <button
                className="flex w-full items-start gap-3 border-b border-border/40 px-3.5 py-3 text-left transition-colors hover:bg-background/50"
                onClick={() => {
                  setRead((s) => new Set(s).add(n.id));
                  const r = routeFromString(n.routeTo);
                  if (r) go(r);
                  onClose();
                }}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border",
                    n.kind === "sla" && "border-danger/30 bg-danger/10 text-danger",
                    n.kind === "ticket" && "border-primary/30 bg-primary/10 text-[#7FA8F5]",
                    n.kind === "approval" && "border-warning/30 bg-warning/10 text-warning",
                    n.kind === "system" && "border-border bg-background text-muted"
                  )}
                >
                  <Icon size={13.5} strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-[12.5px]", n.unread ? "font-semibold text-text" : "font-medium text-text/85")}>
                      {n.title}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-muted/70">{timeAgo(n.at)}</span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-4.5 text-muted">{n.body}</span>
                </span>
                {n.unread && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />}
              </button>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="px-4 py-8 text-center text-[12.5px] text-muted">Nema nepročitanih obavještenja.</li>
        )}
      </ul>
      <div className="border-t border-border/70 px-3.5 py-2 text-center">
        <button className="text-[11.5px] font-medium text-[#7FA8F5] hover:text-text transition-colors">
          Prikaži historiju obavještenja
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Shell                                                             */
/* ---------------------------------------------------------------- */

export function Shell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const { go } = useNav();

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar — desktop */}
      <aside className="hidden w-[248px] shrink-0 border-r border-border bg-surface lg:block">
        <SidebarContent />
      </aside>

      {/* Sidebar — mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[270px] border-r border-border bg-surface pop-in">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-3.5 rounded-md p-1.5 text-muted hover:bg-elevated hover:text-text"
            >
              <X size={16} />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Glavna kolona */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-surface px-4 lg:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-muted hover:bg-elevated hover:text-text lg:hidden"
          >
            <Menu size={17} />
          </button>

          {/* Pretraga */}
          <div className="relative w-full max-w-md">
            <Search size={14.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted/70" />
            <input
              placeholder="Pretraga tiketa, članaka, korisnika…"
              className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-16 text-[12.5px] text-text placeholder:text-muted/60 transition-colors hover:border-[#31405C] focus:border-primary focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") go({ name: "knowledge" });
              }}
            />
            <span className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <Kbd>
                <Command size={10} />
              </Kbd>
              <Kbd>K</Kbd>
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Status sistema */}
            <div className="mr-1 hidden items-center gap-2 rounded-md border border-border bg-background/50 px-2.5 py-1.5 md:flex">
              <span className="dot-pulse size-1.5 rounded-full bg-success" />
              <span className="text-[11.5px] text-muted">
                Svi sistemi <span className="text-text/85">operativni</span>
              </span>
            </div>

            {/* Obavještenja */}
            <div className="relative">
              <button
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setUserOpen(false);
                }}
                className={cn(
                  "relative rounded-md p-2 transition-colors",
                  notifOpen ? "bg-elevated text-text" : "text-muted hover:bg-elevated hover:text-text"
                )}
                aria-label="Obavještenja"
              >
                <Bell size={16.5} strokeWidth={1.9} />
                <span className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-danger text-[8.5px] font-bold text-white tnum">
                  {NOTIFICATIONS.filter((n) => n.unread).length}
                </span>
              </button>
              {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
            </div>

            <div className="mx-1 h-5 w-px bg-border" />

            {/* Korisnički meni */}
            <div className="relative">
              <button
                onClick={() => {
                  setUserOpen((v) => !v);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 rounded-md p-1 pr-1.5 transition-colors hover:bg-elevated"
              >
                <Avatar name={CURRENT_USER.name} size="sm" />
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-[12px] font-medium text-text">{CURRENT_USER.name}</span>
                  <span className="block text-[10px] text-muted">IT odjel · {CURRENT_USER.role}</span>
                </span>
                <ChevronDown size={13} className="text-muted/70" />
              </button>
              {userOpen && (
                <div className="pop-in absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-lg border border-border bg-elevated shadow-xl shadow-black/40">
                  {[
                    "Moj profil i dozvole",
                    "Dodijeljeni tiketi (4)",
                    "Postavke naloga",
                    "Prebaci jezik: BS / EN",
                  ].map((x) => (
                    <button key={x} className="block w-full px-3.5 py-2 text-left text-[12.5px] text-text/90 transition-colors hover:bg-background/60">
                      {x}
                    </button>
                  ))}
                  <div className="border-t border-border/60" />
                  <button className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[12.5px] text-danger/90 transition-colors hover:bg-background/60">
                    <LogOut size={13} /> Odjava (break-glass ostaje aktivan)
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
