import {
  BookOpen,
  GitBranch,
  LayoutDashboard,
  Network,
  Settings,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Separator } from "@/components/ui/separator";
import {
  primaryNavigationItems,
  settingsNavigationItem,
  type NavigationItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const navigationIcons: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/tickets": Ticket,
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center px-3 pr-10">
        <span className="text-[13px] font-medium tracking-tight text-foreground">
          EP-HelpDesk
        </span>
      </div>
      <Separator />
      <nav className="flex flex-1 flex-col gap-6 py-3" aria-label={t("shell.primaryNavigation")}>
        <div className="flex flex-col gap-0.5">
          {primaryNavigationItems.map((item) => (
            <SidebarLink item={item} key={item.path} onNavigate={onNavigate} />
          ))}
        </div>
        <div className="mt-auto flex flex-col gap-0.5">
          <SidebarLink
            item={settingsNavigationItem}
            onNavigate={onNavigate}
          />
        </div>
      </nav>
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
          "flex h-8 items-center gap-2 border-l-2 px-3 text-[13px] leading-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive
            ? "border-primary bg-elevated text-foreground"
            : "border-transparent text-muted-foreground hover:bg-elevated/70 hover:text-foreground",
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{t(item.labelKey)}</span>
    </NavLink>
  );
}
