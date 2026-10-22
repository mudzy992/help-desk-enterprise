import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Boxes } from "lucide-react";
import { AssetCatalogManager } from "@/components/assets/asset-catalog-manager";
import { AssetContractsPanel } from "@/components/assets/asset-contracts-panel";
import { AssetDirectorySyncCard } from "@/components/assets/asset-directory-sync-card";
import { AssetImportPanel } from "@/components/assets/asset-import-panel";
import { AssetLicensesPanel } from "@/components/assets/asset-licenses-panel";
import { AssetOverviewPanel } from "@/components/assets/asset-overview-panel";
import { AssetRegister } from "@/components/assets/asset-register";
import { AssetTransferSettingsCard } from "@/components/assets/asset-transfer-settings-card";
import { AssetTransfersPanel } from "@/components/assets/asset-transfers-panel";
import { ModuleCapabilityGate } from "@/components/entity-list/module-capability-gate";
import { PageHeader } from "@/components/layout/page-header";
import { UnderlineTabs } from "@/components/ui/tabs";
import { resolveModuleCapabilityGate } from "@/lib/entity-list/module-capability-gate";
import { mapApiError, readApiRequestId } from "@/lib/map-api-error";
import { assetQueryKeys, getAssetCapabilities } from "@/services/assets-api";

const assetsTabs = [
  "register",
  "overview",
  "transfers",
  "licenses",
  "contracts",
  "import",
  "catalog",
] as const;
type AssetsTab = (typeof assetsTabs)[number];

/**
 * Delivery invariant (requirement, requirement): the asset register with filters and, for
 * `asset.type.manage`, the catalog of types, attributes and locations.
 */
export function AssetsPage() {
  const { t } = useTranslation();
  const {
    data: capabilities,
    isLoading,
    error,
    refetch: retryCapabilities,
  } = useQuery({
    queryKey: assetQueryKeys.capabilities,
    queryFn: getAssetCapabilities,
    retry: false,
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: AssetsTab = assetsTabs.includes(requestedTab as AssetsTab)
    ? (requestedTab as AssetsTab)
    : "register";

  const header = (
    <PageHeader
      crumbs={[t("navigation.sections.services")]}
      title={t("assets.title")}
      subtitle={t("assets.subtitle")}
    />
  );

  const gateState = resolveModuleCapabilityGate({
    isLoading,
    hasError: error !== null,
    hasData: capabilities !== undefined,
    enabled: capabilities?.enabled,
    canRead: capabilities?.canRead,
  });
  if (gateState !== "ready" || capabilities === undefined) {
    return (
      <ModuleCapabilityGate
        state={gateState}
        header={header}
        icon={<Boxes size={18} />}
        disabledTitle={t("assets.disabledTitle")}
        disabledBody={t("assets.disabledBody")}
        forbiddenTitle={t("assets.forbiddenTitle")}
        forbiddenBody={t("assets.forbiddenBody")}
        errorKey={mapApiError(error)}
        requestId={readApiRequestId(error)}
        onRetry={() => void retryCapabilities()}
      >
        {null}
      </ModuleCapabilityGate>
    );
  }
  return (
    <section>
      {header}
      <div className="grid gap-4">
        <UnderlineTabs
          items={[
            { key: "register", label: t("assets.tabs.register") },
            ...(capabilities.canReadReports
              ? [{ key: "overview", label: t("assets.tabs.overview") }]
              : []),
            { key: "transfers", label: t("assets.tabs.transfers") },
            { key: "licenses", label: t("assets.tabs.licenses") },
            { key: "contracts", label: t("assets.tabs.contracts") },
            ...(capabilities.canImport ? [{ key: "import", label: t("assets.tabs.import") }] : []),
            ...(capabilities.canManageTypes
              ? [{ key: "catalog", label: t("assets.tabs.catalog") }]
              : []),
          ]}
          active={
            (tab === "catalog" && !capabilities.canManageTypes) ||
            (tab === "import" && !capabilities.canImport) ||
            (tab === "overview" && !capabilities.canReadReports)
              ? "register"
              : tab
          }
          onChange={(key) =>
            setSearchParams(key === "register" ? {} : { tab: key }, { replace: true })
          }
        />
        {tab === "overview" && capabilities.canReadReports ? (
          <AssetOverviewPanel />
        ) : tab === "transfers" ? (
          <AssetTransfersPanel mode={{ kind: "all" }} canManage={capabilities.canManage} />
        ) : tab === "licenses" ? (
          <AssetLicensesPanel canManage={capabilities.canManageLicenses} />
        ) : tab === "contracts" ? (
          <AssetContractsPanel canManage={capabilities.canManageContracts} />
        ) : capabilities.canImport && tab === "import" ? (
          <AssetImportPanel />
        ) : capabilities.canManageTypes && tab === "catalog" ? (
          <div className="grid gap-4">
            <AssetCatalogManager />
            <AssetTransferSettingsCard />
            <AssetDirectorySyncCard />
          </div>
        ) : (
          <AssetRegister canManage={capabilities.canManage} />
        )}
      </div>
    </section>
  );
}
