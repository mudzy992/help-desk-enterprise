import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export function ApplicationShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);

  useEffect(() => {
    setIsMobileNavigationOpen(false);
  }, [location.pathname]);

  const closeMobileNavigation = () => {
    setIsMobileNavigationOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-surface md:flex md:flex-col">
        <AppSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onOpenNavigation={() => setIsMobileNavigationOpen(true)} />
        <Sheet open={isMobileNavigationOpen} onOpenChange={setIsMobileNavigationOpen}>
          <SheetContent side="left" className="flex w-56 flex-col p-0">
            <SheetTitle className="sr-only">{t("shell.navigation")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("shell.applicationSections")}
            </SheetDescription>
            <AppSidebar onNavigate={closeMobileNavigation} />
          </SheetContent>
        </Sheet>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
