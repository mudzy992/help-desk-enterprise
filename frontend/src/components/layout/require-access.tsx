import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import type { SessionCapabilities } from "@/lib/session/use-session-capabilities";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

type ForbiddenMessageKey =
  | "admin.forbiddenTitle"
  | "admin.forbiddenBody"
  | "configVersions.forbiddenTitle"
  | "configVersions.forbiddenBody"
  | "reports.forbiddenTitle"
  | "reports.forbiddenBody"
  | "routing.forbiddenTitle"
  | "routing.forbiddenBody"
  | "sla.forbiddenTitle"
  | "sla.forbiddenBody"
  | "permissions.forbiddenTitle"
  | "permissions.forbiddenBody"
  | "policyPacks.forbiddenTitle"
  | "policyPacks.forbiddenBody";

interface RequireAccessProperties {
  readonly check: (capabilities: SessionCapabilities) => boolean;
  readonly forbiddenTitleKey: ForbiddenMessageKey;
  readonly forbiddenBodyKey: ForbiddenMessageKey;
  readonly loadingLabelKey?: "session.loading";
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}

export function RequireAccess({
  check,
  forbiddenTitleKey,
  forbiddenBodyKey,
  loadingLabelKey = "session.loading",
  icon,
  children,
}: RequireAccessProperties) {
  const { t } = useTranslation();
  const capabilities = useSessionCapabilities();

  if (capabilities.isLoading) {
    return <PanelSkeleton label={t(loadingLabelKey)} />;
  }

  if (!check(capabilities)) {
    return (
      <EmptyState
        icon={icon}
        title={t(forbiddenTitleKey)}
        body={t(forbiddenBodyKey)}
      />
    );
  }

  return <>{children}</>;
}
