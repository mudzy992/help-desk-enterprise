import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { InstallGateSkeleton } from "@/components/install/install-gate-skeleton";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { MaintenanceBanner } from "@/components/maintenance/maintenance-banner";
import { PasswordExpiryBanner } from "@/components/account-security/password-expiry-banner";
import { usePublicMaintenance } from "@/lib/maintenance/use-public-maintenance";
import { HelpdeskSocketHost } from "@/lib/realtime/helpdesk-socket-host";
import { useSession } from "@/lib/session/use-session";
import { roleKeys } from "@/lib/session/permission-keys";
import { ActiveTimerHost } from "@/lib/time-tracking/active-timer-host";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/** True when the keystroke is typing, so shortcuts must stay out of the way. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

export function ApplicationShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { session: storedSession } = useSession();
  const { session, isLoading } = useSessionCapabilities();
  const { maintenance } = usePublicMaintenance();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    setIsMobileNavigationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsCommandPaletteOpen((current) => !current);
        return;
      }

      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        setIsCommandPaletteOpen(true);
        return;
      }

      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        navigate("/tickets/new");
      }
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
    <div className="flex h-full min-h-0 bg-background">
      <HelpdeskSocketHost />
      {session.isSuperAdmin ||
      session.roleKeys.includes(roleKeys.agent) ||
      session.roleKeys.includes(roleKeys.admin) ? (
        <ActiveTimerHost accessToken={storedSession.accessToken} />
      ) : null}
      <aside className="hidden w-[258px] shrink-0 border-r border-border lg:block">
        <AppSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          onOpenNavigation={() => setIsMobileNavigationOpen(true)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />
        <Sheet open={isMobileNavigationOpen} onOpenChange={setIsMobileNavigationOpen}>
          <SheetContent side="left" className="flex w-[270px] flex-col p-0">
            <SheetTitle className="sr-only">{t("shell.navigation")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("shell.applicationSections")}
            </SheetDescription>
            <AppSidebar onNavigate={closeMobileNavigation} />
          </SheetContent>
        </Sheet>
        <CommandPalette
          open={isCommandPaletteOpen}
          onOpenChange={setIsCommandPaletteOpen}
        />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div
            key={location.pathname}
            className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8"
          >
            <MaintenanceBanner maintenance={maintenance} />
            <PasswordExpiryBanner />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
