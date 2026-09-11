import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { LocaleSelect } from "@/components/layout/locale-select";
import { SessionControls } from "@/components/layout/session-controls";
import { Button } from "@/components/ui/button";
import { getActiveNavigationItem } from "@/lib/navigation";

interface AppHeaderProperties {
  readonly onOpenNavigation: () => void;
}

export function AppHeader({ onOpenNavigation }: AppHeaderProperties) {
  const { t } = useTranslation();
  const location = useLocation();
  const activeItem = getActiveNavigationItem(location.pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 md:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenNavigation}
        aria-label={t("shell.openNavigation")}
      >
        <Menu className="h-4 w-4" />
      </Button>
      <p className="min-w-0 truncate text-[12.5px] text-muted-foreground">
        {t(activeItem.labelKey)}
      </p>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <SessionControls />
        <LocaleSelect />
      </div>
    </header>
  );
}
