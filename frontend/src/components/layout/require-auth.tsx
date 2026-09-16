import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { InstallGateSkeleton } from "@/components/install/install-gate-skeleton";
import { useSession } from "@/lib/session/use-session";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export function RequireAuth() {
  const location = useLocation();
  const { session: storedSession, signOut } = useSession();
  const { session, isLoading } = useSessionCapabilities();

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
