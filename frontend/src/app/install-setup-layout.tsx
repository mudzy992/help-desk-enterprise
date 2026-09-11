import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useInstallSetup } from "@/app/install-setup-provider";
import { InstallGateSkeleton } from "@/components/install/install-gate-skeleton";
import { resolveInstallGateNavigation } from "@/lib/resolve-install-gate-navigation";

export function InstallSetupLayout() {
  const location = useLocation();
  const { isLoading, isCompleted } = useInstallSetup();

  if (isLoading) {
    return <InstallGateSkeleton />;
  }

  const redirectPath = resolveInstallGateNavigation({
    pathname: location.pathname,
    isSetupComplete: isCompleted,
  });
  if (redirectPath !== null) {
    return <Navigate to={redirectPath} replace />;
  }

  return <Outlet />;
}
