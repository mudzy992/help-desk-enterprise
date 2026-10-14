import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useInstallSetup } from "@/app/install-setup-provider";
import { InstallGateSkeleton } from "@/components/install/install-gate-skeleton";
import { GateStatusError } from "@/components/layout/gate-status-error";
import { resolveInstallGateNavigation } from "@/lib/resolve-install-gate-navigation";

export function InstallSetupLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const setup = useInstallSetup();

  if (setup.status === "loading") {
    return <InstallGateSkeleton />;
  }

  if (setup.status === "error") {
    return (
      <GateStatusError
        title={t("install.statusError.title")}
        body={t("install.statusError.body")}
        retryLabel={t("install.statusError.retry")}
        onRetry={setup.reload}
      />
    );
  }

  const redirectPath = resolveInstallGateNavigation({
    pathname: location.pathname,
    isSetupComplete: setup.isCompleted,
  });
  if (redirectPath !== null) {
    return <Navigate to={redirectPath} replace />;
  }

  return <Outlet />;
}
