import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { InstallGateSkeleton } from "@/components/install/install-gate-skeleton";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MaintenanceBanner } from "@/components/maintenance/maintenance-banner";
import { usePublicMaintenance } from "@/lib/maintenance/use-public-maintenance";
import { HelpdeskSocketHost } from "@/lib/realtime/helpdesk-socket-host";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export function ApplicationShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { session: storedSession } = useSession();
  const { session, isLoading } = useSessionCapabilities();
  const { maintenance } = usePublicMaintenance();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);

  useEffect(() => {
    setIsMobileNavigationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "n" && event.key !== "N") {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      navigate("/tickets/new");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const closeMobileNavigation = () => {
    setIsMobileNavigationOpen(false);
  };

  if (storedSession === null || isLoading || session === null) {
    return <InstallGateSkeleton />;
  }

  return (
    <div className="flex h-full min-h-0 overflow-x-hidden">
      <HelpdeskSocketHost />
      <aside className="hidden w-[248px] shrink-0 border-r border-border bg-surface lg:block">
        <AppSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onOpenNavigation={() => setIsMobileNavigationOpen(true)} />
        <Sheet open={isMobileNavigationOpen} onOpenChange={setIsMobileNavigationOpen}>
          <SheetContent side="left" className="flex w-[270px] flex-col p-0">
            <SheetTitle className="sr-only">{t("shell.navigation")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("shell.applicationSections")}
            </SheetDescription>
            <AppSidebar onNavigate={closeMobileNavigation} />
          </SheetContent>
        </Sheet>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div
            key={location.pathname}
            className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8"
          >
            <MaintenanceBanner maintenance={maintenance} />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
