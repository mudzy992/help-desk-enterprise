import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { SessionCheckError } from "@/components/auth/session-check-error";
import { InstallGateSkeleton } from "@/components/install/install-gate-skeleton";
import { expireSession, notifySessionRefreshed, useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { startSessionKeepAlive } from "@/lib/session/session-keep-alive";
import { setUnauthorizedHandler } from "@/services/api";
import { decideLocaleSync } from "@/i18n/locale-preference-sync";
import { parseLocale, persistLocale } from "@/i18n/locale";
import i18n from "i18next";
import { ensureLocaleResources } from "@/i18n/config";
import { reportClientError } from "@/lib/app/client-logger";
import { getUserPreferences, updateUserPreferences } from "@/services/user-preferences-api";

export function RequireAuth() {
  const location = useLocation();
  const { session: storedSession } = useSession();
  const { session, isLoading, retry } = useSessionCapabilities();

  const hasSession = storedSession !== null;

  // A 401 anywhere ends the session and
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

  // Align the UI language with the saved preference once per session.
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
          await ensureLocaleResources(decision.locale);
          await i18n.changeLanguage(decision.locale);
        }
      })
      .catch((error: unknown) => reportClientError("locale_sync_failed", error));
    return () => {
      cancelled = true;
    };
  }, [hasSession]);

  const returnPath = location.pathname + location.search + location.hash;

  if (storedSession === null) {
    return <Navigate to="/login" replace state={{ from: returnPath }} />;
  }

  if (isLoading) {
    return <InstallGateSkeleton />;
  }

  // A failed check keeps the session: only a 401 ends it (see api.ts).
  if (session === null) {
    return <SessionCheckError onRetry={retry} />;
  }

  return <Outlet />;
}
