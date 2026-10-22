import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { tableHeadClassName, tableRowClassName, ticketIdClassName } from "@/components/ui/control";
import {
  assetStatusKeys,
  assetStatusTone,
  formatAssetDate,
  localizedName,
  resolveAssetIcon,
  warrantyState,
} from "@/lib/assets/asset-view";
import type { AssetListItem } from "@/services/assets-api";

export function AssetRegisterTable({
  items,
  canManage,
  selected,
  locationsEnabled,
  onToggleSelected,
  pageSelected,
  onTogglePage,
}: {
  readonly items: readonly AssetListItem[];
  readonly canManage: boolean;
  readonly selected: ReadonlyMap<string, AssetListItem>;
  readonly locationsEnabled: boolean;
  readonly onToggleSelected: (item: AssetListItem) => void;
  readonly pageSelected: boolean;
  readonly onTogglePage: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toggleSelected = onToggleSelected;
  const togglePage = onTogglePage;
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <caption className="sr-only">{t("assets.list.caption")}</caption>
          <thead>
            <tr className={tableHeadClassName}>
              {canManage ? (
                <th scope="col" className="w-8 px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={pageSelected}
                    onChange={togglePage}
                    aria-label={t("assets.bulk.selectPage")}
                  />
                </th>
              ) : null}
              <th scope="col" className="px-3 py-2 text-left">
                {t("assets.fields.assetTag")}
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                {t("assets.fields.name")}
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                {t("assets.fields.status")}
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                {t("assets.fields.assignedUser")}
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                {t("assets.fields.organizationalUnit")}
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                {t(locationsEnabled ? "assets.fields.location" : "assets.fields.place")}
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                {t("assets.fields.warrantyEndsAt")}
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                {t("assets.list.openTickets")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const Icon = resolveAssetIcon(item.type.icon);
              const warranty = warrantyState(item.warrantyEndsAt);
              return (
                <tr key={item.id} className={tableRowClassName}>
                  {canManage ? (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelected(item)}
                        aria-label={t("assets.bulk.select", {
                          name: `${item.assetTag} ${item.name}`,
                        })}
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <Link to={`/assets/${item.id}`} className={ticketIdClassName}>
                      {item.assetTag}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <Icon
                        size={14}
                        className="shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-foreground">{item.name}</span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          {localizedName(item.type, i18n.language)}
                          {item.serialNumber ? ` · ${item.serialNumber}` : ""}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={assetStatusTone(item.status)}>
                      {t(assetStatusKeys[item.status])}
                    </Badge>
                    {item.missingFromDirectoryAt ? (
                      <Badge tone="warning" className="ml-1">
                        {t("assets.list.missingFromDirectory")}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {item.assignedUser?.displayName ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{item.organizationalUnit.name}</td>
                  <td className="px-3 py-2">
                    {locationsEnabled
                      ? (item.location?.label ?? <span className="text-muted-foreground">—</span>)
                      : item.organizationalUnit.path}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        warranty === "expired"
                          ? "text-danger"
                          : warranty === "expiring"
                            ? "text-warning"
                            : undefined
                      }
                    >
                      {formatAssetDate(item.warrantyEndsAt, i18n.language)}
                    </span>
                    {warranty === "expiring" ? (
                      <span className="sr-only"> {t("assets.warranty.expiring")}</span>
                    ) : null}
                    {warranty === "expired" ? (
                      <span className="sr-only"> {t("assets.warranty.expired")}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{item.openTicketCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
