import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";
import { InstallGateSkeleton } from "@/components/install/install-gate-skeleton";
import { AppHeader } from "@/components/layout/app-header";
import { AnnouncementsHost } from "@/components/announcements/announcements-host";
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
import { AnnouncerRegions } from "@/components/a11y/announcer-regions";
import { RouteFocusManager, mainContentId } from "@/components/a11y/route-focus-manager";
import { SkipToContentLink } from "@/components/a11y/skip-to-content-link";
import { GlobalShortcuts } from "@/components/shortcuts/global-shortcuts";
import { ShortcutsProvider } from "@/components/shortcuts/shortcuts-provider";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export function ApplicationShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const { session: storedSession } = useSession();
  const { session, isLoading } = useSessionCapabilities();
  const { maintenance } = usePublicMaintenance();
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  useEffect(() => {
    setIsMobileNavigationOpen(false);
  }, [location.pathname]);

  const closeMobileNavigation = () => {
    setIsMobileNavigationOpen(false);
  };

  if (storedSession === null || isLoading || session === null) {
    return <InstallGateSkeleton />;
  }

  const isStaff =
    session.isSuperAdmin ||
    session.roleKeys.includes(roleKeys.agent) ||
    session.roleKeys.includes(roleKeys.admin);

  return (
    <ShortcutsProvider defaultEnabled={isStaff}>
    <GlobalShortcuts
      onTogglePalette={() => setIsCommandPaletteOpen((current) => !current)}
      onOpenPalette={() => setIsCommandPaletteOpen(true)}
    />
    <div className="flex h-full min-h-0 bg-background print:block print:h-auto">
      <SkipToContentLink targetId={mainContentId} />
      <AnnouncerRegions />
      <RouteFocusManager />
      <HelpdeskSocketHost />
      {isStaff ? (
        <ActiveTimerHost accessToken={storedSession.accessToken} />
      ) : null}
      <aside className="hidden w-[258px] shrink-0 border-r border-border lg:block print:hidden">
        <AppSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col print:block">
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
        {/* a11y-focus: main only receives programmatic focus (skip link); a ring around the whole page would be noise. */}
        <main
          id={mainContentId}
          tabIndex={-1}
          className="app-main min-h-0 flex-1 overflow-y-auto focus:outline-none print:overflow-visible"
        >
          <div
            key={location.pathname}
            className="page-in mx-auto max-w-[1400px] px-4 py-6 lg:px-8 print:max-w-none print:p-0"
          >
            <div className="print:hidden">
              <MaintenanceBanner maintenance={maintenance} />
              <PasswordExpiryBanner />
              <AnnouncementsHost />
            </div>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
    </ShortcutsProvider>
  );
}
