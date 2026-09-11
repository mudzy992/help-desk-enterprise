import {
  BookOpen,
  GitBranch,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  Network,
  Plus,
  Settings,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { SidebarUserCard } from "@/components/layout/sidebar-user-card";
import { Kbd } from "@/components/ui/kbd";
import {
  navigationSections,
  type NavigationItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const navigationIcons: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/tickets": Ticket,
  "/services": LayoutGrid,
  "/knowledge-base": BookOpen,
  "/users": Users,
  "/organizational-units": Network,
  "/routing": GitBranch,
  "/settings": Settings,
};

interface AppSidebarProperties {
  readonly onNavigate?: () => void;
}

export function AppSidebar({ onNavigate }: AppSidebarProperties) {
  const { t } = useTranslation();
  const location = useLocation();
  const isCreateActive = location.pathname === "/tickets/new";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 border-b border-border/70 px-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <LifeBuoy size={17} strokeWidth={2} />
        </span>
        <div className="leading-tight">
          <p className="text-[13.5px] font-semibold tracking-tight text-foreground">
            EP-HelpDesk
          </p>
          <p className="text-[10.5px] text-muted-foreground/80">
            {t("shell.brandTagline")}
          </p>
        </div>
      </div>
      <div className="px-3 pt-3">
        <NavLink
          to="/tickets/new"
          onClick={onNavigate}
          className={cn(
            "flex h-9 w-full items-center justify-center gap-2 rounded-md border border-primary text-[13px] font-medium text-primary-foreground transition-colors duration-150",
            isCreateActive
              ? "bg-[#1D4FD8]"
              : "bg-primary hover:bg-[#1D4FD8] active:bg-[#1B44BE]",
          )}
        >
          <Plus size={15} strokeWidth={2.2} />
          {t("tickets.createAction")}
          <span className="ml-1 opacity-70">
            <Kbd>N</Kbd>
          </span>
        </NavLink>
      </div>
      <nav
        className="flex-1 overflow-y-auto px-3 py-3"
        aria-label={t("shell.primaryNavigation")}
      >
        {navigationSections.map((section) => (
          <div key={section.labelKey} className="mb-4">
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
              {t(section.labelKey)}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.path}>
                  <SidebarLink item={item} onNavigate={onNavigate} />
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
}

function SidebarLink({ item, onNavigate }: SidebarLinkProperties) {
  const { t } = useTranslation();
  const Icon = navigationIcons[item.path] ?? LayoutDashboard;

  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex h-[34px] w-full items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors duration-150",
          isActive
            ? "bg-elevated font-medium text-foreground"
            : "text-muted-foreground hover:bg-elevated/60 hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span className="absolute left-0 top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-full bg-primary" />
          ) : null}
          <Icon
            size={15.5}
            strokeWidth={1.9}
            className={
              isActive
                ? "text-[#7FA8F5]"
                : "text-muted-foreground/80 group-hover:text-muted-foreground"
            }
            aria-hidden="true"
          />
          <span className="flex-1 truncate text-left">{t(item.labelKey)}</span>
        </>
      )}
    </NavLink>
  );
}
