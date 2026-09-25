import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { InstallGateSkeleton } from "@/components/install/install-gate-skeleton";
import { expireSession, notifySessionRefreshed, useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { startSessionKeepAlive } from "@/lib/session/session-keep-alive";
import { setUnauthorizedHandler } from "@/services/api";

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
