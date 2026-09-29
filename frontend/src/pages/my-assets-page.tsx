import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Laptop } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { errorTextClassName, hintClassName, ticketIdClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  assetStatusKeys,
  assetStatusTone,
  formatAssetDate,
  localizedName,
  mapAssetError,
  resolveAssetIcon,
} from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { assetQueryKeys, getMyAssets } from "@/services/assets-api";

/** Paket 3.2 (§17.9): equipment assigned to the signed-in user, with own tickets. */
export function MyAssetsPage() {
  const { t, i18n } = useTranslation();
  const { data, error, isLoading } = useQuery({ queryKey: assetQueryKeys.mine, queryFn: getMyAssets, retry: false });
  const header = <PageHeader crumbs={[t("navigation.sections.services")]} title={t("assets.mine.title")} subtitle={t("assets.mine.subtitle")} />;

  if (isLoading) {
    return (
      <div>
        {header}
        <PanelSkeleton label={t("ui.loading")} />
      </div>
    );
  }
  if (error) {
    const key = mapAssetError(error);
    return (
      <div>
        {header}
        {key === "assets.errors.disabled" ? (
          <EmptyState icon={<Laptop size={18} />} title={t("assets.disabledTitle")} body={t("assets.disabledBody")} />
        ) : (
          <p role="alert" className={errorTextClassName}>
            {t(key ?? mapApiError(error))}
          </p>
        )}
      </div>
    );
  }
  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <div>
        {header}
        <EmptyState icon={<Laptop size={18} />} title={t("assets.mine.emptyTitle")} body={t("assets.mine.emptyBody")} />
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {header}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={t("assets.mine.listLabel")}>
        {items.map((item) => {
          const Icon = resolveAssetIcon(item.type.icon);
          return (
            <li key={item.id}>
              <Card className="grid h-full gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[13.5px] font-semibold text-foreground">{item.name}</h2>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {localizedName(item.type, i18n.language)} · {item.assetTag}
                    </p>
                  </div>
                  <Badge tone={assetStatusTone(item.status)}>{t(assetStatusKeys[item.status])}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                  <dt className="text-muted-foreground">{t("assets.fields.model")}</dt>
                  <dd className="truncate text-foreground">{[item.manufacturer, item.model].filter(Boolean).join(" ") || "—"}</dd>
                  <dt className="text-muted-foreground">{t("assets.fields.location")}</dt>
                  <dd className="truncate text-foreground">{item.location?.label ?? "—"}</dd>
                  <dt className="text-muted-foreground">{t("assets.fields.assignedAt")}</dt>
                  <dd className="text-foreground">{formatAssetDate(item.assignedAt, i18n.language)}</dd>
                  <dt className="text-muted-foreground">{t("assets.fields.warrantyEndsAt")}</dt>
                  <dd className="text-foreground">{formatAssetDate(item.warrantyEndsAt, i18n.language)}</dd>
                </dl>
                <section>
                  <h3 className="mb-1 text-[12px] font-semibold text-foreground">{t("assets.mine.tickets")}</h3>
                  {item.tickets.length === 0 ? (
                    <p className={hintClassName}>{t("assets.mine.noTickets")}</p>
                  ) : (
                    <ul className="grid gap-1 text-[12px]">
                      {item.tickets.map((ticket) => (
                        <li key={ticket.id} className="flex min-w-0 items-center gap-2">
                          <Link to={`/tickets/${ticket.id}`} className={ticketIdClassName}>
                            {ticket.ticketNumber}
                          </Link>
                          <span className="truncate text-foreground">{ticket.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
