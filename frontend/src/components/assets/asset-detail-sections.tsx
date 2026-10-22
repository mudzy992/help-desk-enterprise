import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { errorTextClassName, hintClassName, ticketIdClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useAssetLocationsEnabled } from "@/lib/assets/use-asset-locations-enabled";
import {
  formatAssetDate,
  formatAssetDateTime,
  formatAttributeValue,
  localizedLabel,
  mapAssetError,
  warrantyState,
} from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  assetQueryKeys,
  getAssetHistory,
  type AssetDetail,
  type AssetHistoryItem,
} from "@/services/assets-api";

function DefinitionRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(120px,40%)_1fr] gap-2 py-1.5 text-[12.5px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

export function AssetOverview({ asset }: { readonly asset: AssetDetail }) {
  const { t, i18n } = useTranslation();
  const locationsEnabled = useAssetLocationsEnabled();
  const language = i18n.language;
  const warranty = warrantyState(asset.warrantyEndsAt);
  const money =
    asset.purchaseCost === null
      ? "—"
      : new Intl.NumberFormat(language.startsWith("bs") ? "bs-BA" : "en-GB", {
          style: "currency",
          currency: asset.currency ?? "BAM",
        }).format(asset.purchaseCost);
  const attributes = asset.attributeDefinitions.filter(
    (definition) => !definition.archived || asset.attributes[definition.key] !== undefined,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0">
        <CardHeader title={t("assets.detail.basics")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("assets.fields.assetTag")}>{asset.assetTag}</DefinitionRow>
          <DefinitionRow label={t("assets.fields.manufacturer")}>
            {asset.manufacturer ?? "—"}
          </DefinitionRow>
          <DefinitionRow label={t("assets.fields.model")}>{asset.model ?? "—"}</DefinitionRow>
          <DefinitionRow label={t("assets.fields.serialNumber")}>
            {asset.serialNumber ?? "—"}
          </DefinitionRow>
          <DefinitionRow label={t("assets.fields.service")}>
            {asset.service?.name ?? "—"}
          </DefinitionRow>
          {asset.externalId ? (
            <DefinitionRow label={t("assets.fields.externalId")}>{asset.externalId}</DefinitionRow>
          ) : null}
          {asset.lastSeenAt ? (
            <DefinitionRow label={t("assets.fields.lastSeenAt")}>
              {formatAssetDateTime(asset.lastSeenAt, language)}
            </DefinitionRow>
          ) : null}
          <DefinitionRow label={t("assets.fields.notes")}>
            {asset.notes ? <span className="whitespace-pre-wrap">{asset.notes}</span> : "—"}
          </DefinitionRow>
        </dl>
      </Card>

      <Card className="p-0">
        <CardHeader title={t("assets.detail.assignment")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("assets.fields.assignedUser")}>
            {asset.assignedUser ? (
              <span>
                {asset.assignedUser.displayName}
                <span className="block text-[11.5px] text-muted-foreground">
                  {asset.assignedUser.email}
                </span>
                {asset.assignmentSuggested ? (
                  <Badge tone="warning" className="mt-1">
                    {t("assets.detail.assignmentSuggested")}
                  </Badge>
                ) : null}
              </span>
            ) : (
              "—"
            )}
          </DefinitionRow>
          <DefinitionRow label={t("assets.fields.assignedAt")}>
            {asset.assignedAt ? formatAssetDateTime(asset.assignedAt, language) : "—"}
          </DefinitionRow>
          <DefinitionRow label={t("assets.fields.organizationalUnit")}>
            {asset.organizationalUnit.name}
            <span className="block text-[11.5px] text-muted-foreground">
              {asset.organizationalUnit.path}
            </span>
          </DefinitionRow>
          {locationsEnabled ? (
            <DefinitionRow label={t("assets.fields.location")}>
              {asset.location?.label ?? "—"}
            </DefinitionRow>
          ) : (
            <DefinitionRow label={t("assets.fields.place")}>
              {asset.organizationalUnit.pathLabel}
            </DefinitionRow>
          )}
        </dl>
      </Card>

      <Card className="p-0">
        <CardHeader title={t("assets.detail.purchase")} />
        <dl className="divide-y divide-border/60 px-4 py-2">
          <DefinitionRow label={t("assets.fields.purchaseDate")}>
            {formatAssetDate(asset.purchaseDate, language)}
          </DefinitionRow>
          <DefinitionRow label={t("assets.fields.purchaseCost")}>{money}</DefinitionRow>
          <DefinitionRow label={t("assets.fields.supplier")}>{asset.supplier ?? "—"}</DefinitionRow>
          <DefinitionRow label={t("assets.fields.warrantyEndsAt")}>
            <span className="flex flex-wrap items-center gap-2">
              {formatAssetDate(asset.warrantyEndsAt, language)}
              {warranty === "expired" ? (
                <Badge tone="danger">{t("assets.warranty.expired")}</Badge>
              ) : null}
              {warranty === "expiring" ? (
                <Badge tone="warning">{t("assets.warranty.expiring")}</Badge>
              ) : null}
            </span>
          </DefinitionRow>
        </dl>
      </Card>

      <Card className="p-0">
        <CardHeader title={t("assets.detail.attributes")} />
        {attributes.length === 0 ? (
          <p className={`px-4 py-3 ${hintClassName}`}>{t("assets.detail.noAttributes")}</p>
        ) : (
          <dl className="divide-y divide-border/60 px-4 py-2">
            {attributes.map((definition) => (
              <DefinitionRow key={definition.key} label={localizedLabel(definition, language)}>
                {formatAttributeValue(
                  asset.attributes[definition.key],
                  definition.dataType,
                  language,
                  t("assets.detail.yes"),
                  t("assets.detail.no"),
                )}
              </DefinitionRow>
            ))}
          </dl>
        )}
      </Card>
    </div>
  );
}

export function AssetTickets({ asset }: { readonly asset: AssetDetail }) {
  const { t, i18n } = useTranslation();
  if (asset.tickets.recent.length === 0) {
    return (
      <EmptyState
        icon={<History size={18} />}
        title={t("assets.detail.noTicketsTitle")}
        body={t("assets.detail.noTicketsBody")}
      />
    );
  }
  return (
    <Card className="p-0">
      <CardHeader
        title={t("assets.detail.ticketsTitle")}
        subtitle={t("assets.detail.ticketsSubtitle", {
          total: asset.tickets.total,
          open: asset.tickets.open,
        })}
      />
      <ul className="divide-y divide-border/60">
        {asset.tickets.recent.map((ticket) => (
          <li
            key={ticket.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[12.5px]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Link to={`/tickets/${ticket.id}`} className={ticketIdClassName}>
                {ticket.ticketNumber}
              </Link>
              <span className="truncate text-foreground">{ticket.title}</span>
              {ticket.isPrimary ? (
                <Badge tone="primary">{t("assets.detail.primaryLink")}</Badge>
              ) : null}
            </span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Badge tone="neutral">{ticket.status}</Badge>
              {formatAssetDateTime(ticket.createdAt, i18n.language)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function historyText(
  item: AssetHistoryItem,
  users: Readonly<Record<string, string | null>>,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const detail = item.detail;
  const userName =
    typeof detail.userId === "string"
      ? (users[detail.userId] ?? t("assets.history.unknownUser"))
      : null;
  switch (item.action) {
    case "status":
      return t("assets.history.text.status", {
        from: typeof detail.from === "string" ? t(`assets.status.${detail.from}`) : "—",
        to: typeof detail.to === "string" ? t(`assets.status.${detail.to}`) : "—",
      });
    case "assigned":
      return t("assets.history.text.assigned", { name: userName ?? "—" });
    case "unassigned":
      return t("assets.history.text.unassigned", { name: userName ?? "—" });
    case "updated": {
      const changes =
        detail.changes && typeof detail.changes === "object"
          ? Object.keys(detail.changes as object)
          : [];
      return t("assets.history.text.updated", { fields: changes.join(", ") || "—" });
    }
    default:
      return t(`assets.history.actions.${item.action}`, { defaultValue: item.action });
  }
}

export function AssetHistoryPanel({ assetId }: { readonly assetId: string }) {
  const { t, i18n } = useTranslation();
  const historyQuery = useInfiniteQuery({
    queryKey: assetQueryKeys.history(assetId),
    queryFn: ({ pageParam }) => getAssetHistory(assetId, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    retry: false,
  });
  if (historyQuery.isLoading) return <PanelSkeleton label={t("ui.loading")} />;
  if (historyQuery.error) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapAssetError(historyQuery.error) ?? mapApiError(historyQuery.error))}
      </p>
    );
  }
  const pages = historyQuery.data?.pages ?? [];
  const users = Object.assign({}, ...pages.map((page) => page.users)) as Record<
    string,
    string | null
  >;
  const items = pages.flatMap((page) => page.items);
  const translate = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  return (
    <Card className="p-0">
      <CardHeader title={t("assets.history.title")} />
      <ol className="divide-y divide-border/60">
        {items.map((item) => {
          const reason =
            typeof item.detail.reason === "string"
              ? item.detail.reason
              : typeof item.detail.note === "string"
                ? item.detail.note
                : null;
          return (
            <li key={item.id} className="grid gap-0.5 px-4 py-2 text-[12.5px]">
              <span className="text-foreground">{historyText(item, users, translate)}</span>
              {reason ? <span className="text-muted-foreground">„{reason}“</span> : null}
              {typeof item.detail.transferNumber === "string" ? (
                <span className="text-muted-foreground">
                  {t("assets.history.transfer", { number: item.detail.transferNumber })}
                </span>
              ) : null}
              <span className="text-[11.5px] text-muted-foreground">
                {formatAssetDateTime(item.createdAt, i18n.language)} ·{" "}
                {item.actorUserId
                  ? (users[item.actorUserId] ?? t("assets.history.unknownUser"))
                  : t("assets.history.system")}
              </span>
            </li>
          );
        })}
      </ol>
      {historyQuery.hasNextPage ? (
        <div className="flex justify-center p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void historyQuery.fetchNextPage()}
            disabled={historyQuery.isFetchingNextPage}
          >
            {t("assets.list.loadMore")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
