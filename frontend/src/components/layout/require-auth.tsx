import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { InstallGateSkeleton } from "@/components/install/install-gate-skeleton";
import { expireSession, notifySessionRefreshed, useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { startSessionKeepAlive } from "@/lib/session/session-keep-alive";
import { setUnauthorizedHandler } from "@/services/api";
import { decideLocaleSync } from "@/i18n/locale-preference-sync";
import { parseLocale, persistLocale } from "@/i18n/locale";
import i18n from "i18next";
import { getUserPreferences, updateUserPreferences } from "@/services/user-preferences-api";

export function RequireAuth() {
  const location = useLocation();
  const { session: storedSession, signOut } = useSession();
  const { session, isLoading } = useSessionCapabilities();

  const hasSession = storedSession !== null;

  // Review 2026-09-25 (S10 + 1 h sessions): a 401 anywhere ends the session and
  // RequireAuth sends the user to /login (with `from`); an active user's token is
  // refreshed before it expires.
  useEffect(() => {
    if (!hasSession) return undefined;
    setUnauthorizedHandler(expireSession);
    const stop = startSessionKeepAlive({
      onSessionChanged: notifySessionRefreshed,
      onExpired: expireSession,
    });
    return () => {
      stop();
      setUnauthorizedHandler(null);
    };
  }, [hasSession]);

  // Paket 1.5: align the UI language with the saved preference once per session.
  useEffect(() => {
    if (!hasSession) return undefined;
    let cancelled = false;
    void getUserPreferences()
      .then(async (preferences) => {
        if (cancelled) return;
        const decision = decideLocaleSync({
          serverLocale: preferences.preferredLocale,
          currentLocale: parseLocale(i18n.language),
        });
        if (decision.action === "push") {
          await updateUserPreferences({ preferredLocale: decision.locale });
        } else if (decision.action === "apply") {
          persistLocale(decision.locale);
          await i18n.changeLanguage(decision.locale);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  useEffect(() => {
    if (!isLoading && storedSession !== null && session === null) {
      signOut();
    }
  }, [isLoading, session, signOut, storedSession]);

  if (storedSession === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (isLoading) {
    return <InstallGateSkeleton />;
  }

  if (session === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
