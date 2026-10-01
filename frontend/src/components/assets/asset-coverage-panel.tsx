import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { AssetExpiryBadge } from "@/components/assets/asset-expiry-badge";
import { formatAssetDate } from "@/lib/assets/asset-view";
import type { AssetDetail } from "@/services/assets-api";

/** Paket 3.2 (§17.3): licences on the device (or its user) and covering contracts. */
export function AssetCoveragePanel({ asset }: { readonly asset: AssetDetail }) {
  const { t, i18n } = useTranslation();
  const licenses = asset.licenses ?? [];
  const contracts = asset.contracts ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0">
        <CardHeader title={t("assets.coverage.licensesTitle")} />
        <div className="grid gap-1 p-4 text-[12.5px]">
          {licenses.length === 0 ? <p className={hintClassName}>{t("assets.coverage.noLicenses")}</p> : null}
          {licenses.map((entry) => (
            <div key={entry.assignmentId} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-foreground">{entry.license.productName}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {t(`assets.licenses.kinds.${entry.license.kind}` as const)}
                  {entry.license.vendor ? ` · ${entry.license.vendor}` : ""}
                  {entry.license.validUntil ? ` · ${formatAssetDate(entry.license.validUntil, i18n.language)}` : ""}
                </span>
              </span>
              <Badge tone={entry.via === "asset" ? "info" : "neutral"}>
                {entry.via === "asset" ? t("assets.coverage.viaAsset") : t("assets.coverage.viaUser")}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-0">
        <CardHeader title={t("assets.coverage.contractsTitle")} />
        <div className="grid gap-1 p-4 text-[12.5px]">
          {contracts.length === 0 ? <p className={hintClassName}>{t("assets.coverage.noContracts")}</p> : null}
          {contracts.map((contract) => (
            <div key={contract.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5">
              <span className="min-w-0">
                <span className="block truncate text-foreground">{contract.supplier}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {t(`assets.contracts.kinds.${contract.kind}` as const)}
                  {contract.reference ? ` · ${contract.reference}` : ""} · {formatAssetDate(contract.endsAt, i18n.language)}
                </span>
              </span>
              <AssetExpiryBadge daysLeft={contract.daysLeft} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
