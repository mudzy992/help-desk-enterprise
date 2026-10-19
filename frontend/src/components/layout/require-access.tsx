import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import type { SessionCapabilities } from "@/lib/session/use-session-capabilities";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";

export type ForbiddenMessageScope =
  | "admin"
  | "assets"
  | "changes"
  | "configVersions"
  | "onCall"
  | "permissions"
  | "policyPacks"
  | "privacy"
  | "problems"
  | "reports"
  | "routing"
  | "sla";

export type ForbiddenMessageKey =
  `${ForbiddenMessageScope}.forbiddenTitle` | `${ForbiddenMessageScope}.forbiddenBody`;

interface RequireAccessProperties {
  readonly check: (capabilities: SessionCapabilities) => boolean;
  readonly forbiddenTitleKey: `${ForbiddenMessageScope}.forbiddenTitle`;
  readonly forbiddenBodyKey: `${ForbiddenMessageScope}.forbiddenBody`;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}

export function RequireAccess({
  check,
  forbiddenTitleKey,
  forbiddenBodyKey,
  icon,
  children,
}: RequireAccessProperties) {
  const { t } = useTranslation();
  const capabilities = useSessionCapabilities();

  if (capabilities.isLoading) {
    return <PanelSkeleton label={t("session.loading")} />;
  }

  if (!check(capabilities)) {
    return <EmptyState icon={icon} title={t(forbiddenTitleKey)} body={t(forbiddenBodyKey)} />;
  }

  return <>{children}</>;
}
