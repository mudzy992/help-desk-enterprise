import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { AssetExpiryBadge } from "@/components/assets/asset-expiry-badge";
import { formatAssetDate, mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import type { CursorPage } from "@/services/cursor-page";
import {
  listAssetContractCoverage,
  listAssetLicenseCoverage,
  type AssetContractLink,
  type AssetDetail,
  type AssetLicenseLink,
} from "@/services/assets-api";

/** Delivery invariant (requirement): licences on the device (or its user) and covering contracts. */
export function AssetCoveragePanel({ asset }: { readonly asset: AssetDetail }) {
  const { t, i18n } = useTranslation();
  const [licensePages, setLicensePages] = useState<CursorPage<AssetLicenseLink>[]>([]);
  const [contractPages, setContractPages] = useState<CursorPage<AssetContractLink>[]>([]);
  const [loadingLicenses, setLoadingLicenses] = useState(false);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLicensePages([]);
    setContractPages([]);
    setLoadingLicenses(false);
    setLoadingContracts(false);
    setError(null);
  }, [asset]);

  const licensePage = licensePages.at(-1);
  const contractPage = contractPages.at(-1);
  const licenses = [...(asset.licenses ?? []), ...licensePages.flatMap((page) => page.items)];
  const contracts = [...(asset.contracts ?? []), ...contractPages.flatMap((page) => page.items)];
  const licensesHasMore = licensePage?.hasMore ?? asset.licensesPage?.hasMore ?? false;
  const contractsHasMore = contractPage?.hasMore ?? asset.contractsPage?.hasMore ?? false;
  const licenseCursor = licensePages.length > 0 ? licensePage?.nextCursor ?? undefined : asset.licensesPage?.nextCursor ?? undefined;
  const contractCursor = contractPages.length > 0 ? contractPage?.nextCursor ?? undefined : asset.contractsPage?.nextCursor ?? undefined;

  async function loadMoreLicenses() {
    if (!licenseCursor || loadingLicenses) return;
    setLoadingLicenses(true);
    setError(null);
    try {
      const page = await listAssetLicenseCoverage(asset.id, licenseCursor);
      setLicensePages((current) => [...current, page]);
    } catch (caught) {
      setError(t(mapAssetError(caught) ?? mapApiError(caught)));
    } finally {
      setLoadingLicenses(false);
    }
  }

  async function loadMoreContracts() {
    if (!contractCursor || loadingContracts) return;
    setLoadingContracts(true);
    setError(null);
    try {
      const page = await listAssetContractCoverage(asset.id, contractCursor);
      setContractPages((current) => [...current, page]);
    } catch (caught) {
      setError(t(mapAssetError(caught) ?? mapApiError(caught)));
    } finally {
      setLoadingContracts(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {error ? (
        <p role="alert" className={`lg:col-span-2 ${errorTextClassName}`}>
          {error}
        </p>
      ) : null}
      <Card className="p-0">
        <CardHeader title={t("assets.coverage.licensesTitle")} />
        <div className="grid gap-1 p-4 text-[12.5px]">
          {licenses.length === 0 && !licensesHasMore ? (
            <p className={hintClassName}>{t("assets.coverage.noLicenses")}</p>
          ) : null}
          {licenses.map((entry) => (
            <div
              key={entry.assignmentId}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
            >
              <span className="min-w-0">
                <span className="block truncate text-foreground">{entry.license.productName}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {t(`assets.licenses.kinds.${entry.license.kind}` as const)}
                  {entry.license.vendor ? ` · ${entry.license.vendor}` : ""}
                  {entry.license.validUntil
                    ? ` · ${formatAssetDate(entry.license.validUntil, i18n.language)}`
                    : ""}
                </span>
              </span>
              <Badge tone={entry.via === "asset" ? "info" : "neutral"}>
                {entry.via === "asset"
                  ? t("assets.coverage.viaAsset")
                  : t("assets.coverage.viaUser")}
              </Badge>
            </div>
          ))}
          {licensesHasMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 justify-self-start"
              disabled={loadingLicenses}
              onClick={() => void loadMoreLicenses()}
            >
              {loadingLicenses ? t("ui.loading") : t("assets.list.loadMore")}
            </Button>
          ) : null}
        </div>
      </Card>
      <Card className="p-0">
        <CardHeader title={t("assets.coverage.contractsTitle")} />
        <div className="grid gap-1 p-4 text-[12.5px]">
          {contracts.length === 0 && !contractsHasMore ? (
            <p className={hintClassName}>{t("assets.coverage.noContracts")}</p>
          ) : null}
          {contracts.map((contract) => (
            <div
              key={contract.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
            >
              <span className="min-w-0">
                <span className="block truncate text-foreground">{contract.supplier}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {t(`assets.contracts.kinds.${contract.kind}` as const)}
                  {contract.reference ? ` · ${contract.reference}` : ""} ·{" "}
                  {formatAssetDate(contract.endsAt, i18n.language)}
                </span>
              </span>
              <AssetExpiryBadge daysLeft={contract.daysLeft} />
            </div>
          ))}
          {contractsHasMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 justify-self-start"
              disabled={loadingContracts}
              onClick={() => void loadMoreContracts()}
            >
              {loadingContracts ? t("ui.loading") : t("assets.list.loadMore")}
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
