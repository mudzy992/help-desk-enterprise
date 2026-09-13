import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HeaderSearch } from "@/components/layout/header-search";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { SessionControls } from "@/components/layout/session-controls";
import { SystemStatusChip } from "@/components/layout/system-status-chip";
import { Button } from "@/components/ui/button";

interface AppHeaderProperties {
  readonly onOpenNavigation: () => void;
}

export function AppHeader({ onOpenNavigation }: AppHeaderProperties) {
  const { t } = useTranslation();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-surface px-4 lg:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenNavigation}
        aria-label={t("shell.openNavigation")}
      >
        <Menu size={17} strokeWidth={1.9} />
      </Button>
      <HeaderSearch />
      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <SystemStatusChip />
        <NotificationsBell />
        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <SessionControls />
      </div>
    </header>
  );
}
