import {
  BarChart3,
  BookOpen,
  GitBranch,
  History,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Settings2,
  Ticket,
  Timer,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon per navigation destination. Shared by the sidebar and the command
 * palette so the same page never gets two different glyphs.
 */
const navigationIcons: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/reports": BarChart3,
  "/tickets?view=all": Ticket,
  "/tickets?view=inbox": Inbox,
  "/services": LayoutGrid,
  "/knowledge-base": BookOpen,
  "/routing": GitBranch,
  "/sla": Timer,
  "/admin": Settings2,
  "/admin/config-versions": History,
};

export function navigationIconFor(path: string): LucideIcon {
  return navigationIcons[path] ?? LayoutDashboard;
}
