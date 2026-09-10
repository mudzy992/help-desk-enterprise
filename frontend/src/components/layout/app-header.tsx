import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { LocaleSelect } from "@/components/layout/locale-select";
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
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 md:px-6">
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
      <h1 className="min-w-0 truncate text-section font-medium text-foreground">
        {t(activeItem.labelKey)}
      </h1>
      <LocaleSelect />
    </header>
  );
}
