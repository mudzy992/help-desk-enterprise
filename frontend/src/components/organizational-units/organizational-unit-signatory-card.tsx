import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Pencil, X } from "lucide-react";
import { AssetSignatorySheet } from "@/components/assets/asset-signatory-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { hintClassName } from "@/components/ui/control";
import { useToast } from "@/components/ui/toast";
import { mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { assetTransferQueryKeys, getAssetSignatories, removeAssetSignatory } from "@/services/asset-transfers-api";

interface OrganizationalUnitSignatoryCardProperties {
  readonly unitId: string;
  /** Session `modules.cmdb`: without the module the card does not exist. */
  readonly enabled: boolean;
}

/**
 * Paket 3.2 C9c: the transfer-record signatory is a property of the
 * organizational unit, so it is edited here (Administration → Organization).
 * Only admins with asset.type.manage over every unit get data; anybody else
 * gets 403/404 and the card stays hidden.
 */
export function OrganizationalUnitSignatoryCard({ unitId, enabled }: OrganizationalUnitSignatoryCardProperties) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: assetTransferQueryKeys.signatories, queryFn: getAssetSignatories, enabled, retry: false });
  if (!enabled || !query.data) return null;
  const units = query.data.units;
  const unit = units.find((entry) => entry.id === unitId);
  if (!unit) return null;
  const inheritedFrom = unit.effective.inheritedFromUnitId ? units.find((entry) => entry.id === unit.effective.inheritedFromUnitId)?.name : null;

  async function remove() {
    try {
      await removeAssetSignatory(unitId);
      await queryClient.invalidateQueries({ queryKey: assetTransferQueryKeys.signatories });
      toast({ tone: "success", title: t("assets.transfers.signatories.removed", { unit: unit?.name ?? "" }) });
    } catch (caught) {
      toast({ tone: "danger", title: t("assets.transfers.actionFailed"), description: t(mapAssetError(caught) ?? mapApiError(caught)) });
    }
  }

  return (
    <Card>
      <CardHeader
        title={t("assets.transfers.signatories.cardTitle")}
        subtitle={t("assets.transfers.signatories.cardSubtitle")}
        actions={
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil size={13} aria-hidden="true" />
              {unit.own ? t("assets.transfers.signatories.change") : t("assets.transfers.signatories.set")}
            </Button>
            {unit.own ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => void remove()} aria-label={t("assets.transfers.signatories.removeFor", { unit: unit.name })}>
                <X size={13} aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="grid gap-1 px-4 pb-4 pt-3 text-[12.5px]">
        {unit.own ? (
          <p className="text-foreground">
            {unit.own.displayName}
            {unit.own.title ? <span className="text-muted-foreground"> · {unit.own.title}</span> : null}
            {!unit.own.isActive ? (
              <Badge tone="warning" className="ml-2">
                {t("assets.transfers.signatories.inactive")}
              </Badge>
            ) : null}
          </p>
        ) : (
          <p className="text-foreground">
            {unit.effective.displayName ?? t("assets.transfers.noSignatory")}
            {inheritedFrom ? <span className="text-muted-foreground"> ({t("assets.transfers.signatories.inheritedFrom", { unit: inheritedFrom })})</span> : null}
            {unit.effective.source === "default" ? <span className="text-muted-foreground"> ({t("assets.transfers.signatories.fromDefault")})</span> : null}
          </p>
        )}
        <p className={hintClassName}>{t("assets.transfers.signatories.sheetDescription")}</p>
      </div>
      <AssetSignatorySheet unit={editing ? unit : null} onOpenChange={(open) => setEditing(open)} />
    </Card>
  );
}
