import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router-dom";
import { BrandLockup } from "@/components/layout/brand-mark";
import { SidebarCountBadge } from "@/components/layout/sidebar-count-badge";
import { SidebarUserCard } from "@/components/layout/sidebar-user-card";
import { navigationIconFor } from "@/lib/navigation-icons";
import {
  isNavigationItemActive,
  navigationSections,
  type NavigationItem,
} from "@/lib/navigation";
import { filterNavigationSections, isTicketStaff } from "@/lib/session/route-access";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { useSidebarTicketCounts } from "@/lib/tickets/use-sidebar-ticket-counts";
import type { SidebarTicketCounts } from "@/lib/tickets/count-sidebar-ticket-badges";
import { cn } from "@/lib/utils";

interface AppSidebarProperties {
  readonly onNavigate?: () => void;
}

export function AppSidebar({ onNavigate }: AppSidebarProperties) {
  const { t } = useTranslation();
  const location = useLocation();
  const capabilities = useSessionCapabilities();
  const ticketCounts = useSidebarTicketCounts(isTicketStaff(capabilities));
  const visibleSections = filterNavigationSections(navigationSections, capabilities);
  const isCreateActive = location.pathname === "/tickets/new";

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-14 shrink-0 items-center border-b border-border/70 px-4">
        <Link to="/" onClick={onNavigate} className="min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-primary/70">
          <BrandLockup subtitle={t("shell.brandTagline")} />
        </Link>
      </div>

      <div className="px-3 pt-3">
        <NavLink
          to="/tickets/new"
          onClick={onNavigate}
          className={cn(
            "pulse-gradient flex h-9 w-full items-center justify-center gap-2 rounded-md text-[13px] font-semibold text-white shadow-glow transition-all duration-200 hover:brightness-[1.06] active:brightness-95",
            isCreateActive && "brightness-95",
          )}
        >
          <Plus size={15} strokeWidth={2.5} />
          {t("tickets.createAction")}
          <span className="ml-0.5 rounded-[5px] bg-white/20 px-1 text-[10px] font-bold">
            N
          </span>
        </NavLink>
      </div>

      <nav
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        aria-label={t("shell.primaryNavigation")}
      >
        {visibleSections.map((section) => (
          <div key={section.labelKey} className="mb-4 last:mb-0">
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t(section.labelKey)}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.labelKey}>
                  <SidebarLink
                    item={item}
                    onNavigate={onNavigate}
                    ticketCounts={ticketCounts}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <SidebarUserCard />
    </div>
  );
}

interface SidebarLinkProperties {
  readonly item: NavigationItem;
  readonly onNavigate?: () => void;
  readonly ticketCounts: SidebarTicketCounts | null;
}

function SidebarLink({
  item,
  onNavigate,
  ticketCounts,
}: SidebarLinkProperties) {
  const { t } = useTranslation();
  const location = useLocation();
  const Icon = navigationIconFor(item.path);
  const isActive = isNavigationItemActive(
    item,
    location.pathname,
    location.search,
  );

  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex h-[34px] w-full items-center gap-2.5 rounded-[9px] px-2 text-[13px] transition-colors duration-150",
        isActive
          ? "bg-primary/10 font-medium text-foreground"
          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
      )}
    >
      {isActive ? (
        <span className="absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-r-full bg-primary" />
      ) : null}
      <Icon
        size={15.5}
        strokeWidth={1.9}
        className={cn(
          "shrink-0",
          isActive ? "text-link" : "text-muted-foreground group-hover:text-foreground",
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate text-left">{t(item.labelKey)}</span>
      <SidebarCountBadge item={item} ticketCounts={ticketCounts} />
    </Link>
  );
}
