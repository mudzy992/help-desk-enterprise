import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PolicyPackApplyForm } from "@/components/policy-packs/policy-pack-apply-form";
import { PolicyPackCards } from "@/components/policy-packs/policy-pack-cards";
import { errorTextClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { mapPolicyPacksError, type PolicyPacksMessageKey } from "@/lib/policy-packs/map-policy-packs-error";
import { roleKeys } from "@/lib/session/permission-keys";
import { useSessionCapabilities } from "@/lib/session/use-session-capabilities";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import { listOrganizationalUnitTree } from "@/services/organizational-units-api";
import {
  listPolicyPacks,
  type PolicyPackSummary,
} from "@/services/policy-packs-api";
import { listServices } from "@/services/service-catalog-api";
import { Package } from "lucide-react";

export function PolicyPacksPanel() {
  const { session, hasRole, isLoading } = useSessionCapabilities();
  const canManage =
    session?.isSuperAdmin === true || hasRole(roleKeys.superAdmin);
  if (isLoading || !canManage) {
    return null;
  }
  return <PolicyPacksWorkspace />;
}

function PolicyPacksWorkspace() {
  const { t } = useTranslation();
  const [packs, setPacks] = useState<readonly PolicyPackSummary[]>([]);
  const [unitOptions, setUnitOptions] = useState<
    readonly { id: string; label: string }[]
  >([]);
  const [serviceOptions, setServiceOptions] = useState<
    readonly { id: string; label: string }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<PolicyPacksMessageKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listPolicyPacks(),
      listOrganizationalUnitTree(),
      listServices().catch(() => []),
    ])
      .then(([loadedPacks, tree, services]) => {
        if (cancelled) {
          return;
        }
        setPacks(loadedPacks);
        setUnitOptions(flattenOriginUnitOptions(tree));
        setServiceOptions(
          services.map((service) => ({
            id: service.id,
            label: service.name,
          })),
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorKey(mapPolicyPacksError(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return <PanelSkeleton label={t("policyPacks.loading")} />;
  }
  if (errorKey) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(errorKey)}
      </p>
    );
  }
  if (packs.length === 0) {
    return (
      <EmptyState
        icon={<Package size={18} strokeWidth={1.8} />}
        title={t("policyPacks.emptyTitle")}
        body={t("policyPacks.emptyBody")}
      />
    );
  }
  return (
    <div className="mb-4 space-y-4">
      <PolicyPackCards packs={packs} />
      <PolicyPackApplyForm
        packs={packs}
        unitOptions={unitOptions}
        serviceOptions={serviceOptions}
      />
    </div>
  );
}
