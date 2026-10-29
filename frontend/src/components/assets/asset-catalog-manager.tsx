import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Archive, ArchiveRestore, MapPin, Pencil, Plus } from "lucide-react";
import { AssetCatalogEditors } from "@/components/assets/asset-catalog-editors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  errorTextClassName,
  hintClassName,
  rowActionButtonClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  assetErrorDetail,
  assetLocationDepthMax,
  flattenLocationTree,
  localizedLabel,
  localizedName,
  mapAssetError,
  resolveAssetIcon,
} from "@/lib/assets/asset-view";
import {
  entityMutationQueryKeys,
  invalidateEntityQueries,
} from "@/lib/entity-list/entity-mutation-query-keys";
import { mapApiError } from "@/lib/map-api-error";
import { useAssetLocationsEnabled } from "@/lib/assets/use-asset-locations-enabled";
import {
  assetQueryKeys,
  getAssetCatalog,
  setAssetAttributeArchived,
  setAssetLocationArchived,
  setAssetTypeArchived,
  type AssetAttribute,
  type AssetLocation,
  type AssetType,
} from "@/services/assets-api";

type Editor =
  | { readonly kind: "type"; readonly type: AssetType | null }
  | {
      readonly kind: "attribute";
      readonly type: AssetType;
      readonly attribute: AssetAttribute | null;
    }
  | {
      readonly kind: "location";
      readonly location: AssetLocation | null;
      readonly parentId?: string;
    }
  | null;

function useErrorText() {
  const { t } = useTranslation();
  return (caught: unknown) => {
    const detail = assetErrorDetail(caught);
    const message = t(mapAssetError(caught) ?? mapApiError(caught));
    return detail ? `${message} (${detail})` : message;
  };
}

/** Delivery invariant (requirement, requirement, requirement): types with attributes, and locations (asset.type.manage). */
export function AssetCatalogManager() {
  const { t, i18n } = useTranslation();
  const locationsEnabled = useAssetLocationsEnabled();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const errorText = useErrorText();
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const catalogQuery = useQuery({
    queryKey: assetQueryKeys.catalog(showArchived),
    queryFn: () => getAssetCatalog(showArchived),
    retry: false,
  });

  const refresh = () =>
    void invalidateEntityQueries(queryClient, entityMutationQueryKeys.assets.catalog);

  async function toggleArchived(action: () => Promise<unknown>) {
    try {
      await action();
      refresh();
    } catch (caught) {
      toast({
        tone: "danger",
        title: t("assets.catalog.actionFailed"),
        description: errorText(caught),
        error: caught,
      });
    }
  }

  if (catalogQuery.isLoading) return <PanelSkeleton label={t("ui.loading")} />;
  if (catalogQuery.error || catalogQuery.data === undefined) {
    return (
      <p role="alert" className={errorTextClassName}>
        {t(mapAssetError(catalogQuery.error) ?? mapApiError(catalogQuery.error))}
      </p>
    );
  }
  const catalog = catalogQuery.data;
  const locationRows = flattenLocationTree(catalog.locations);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Checkbox
          label={t("assets.catalog.showArchived")}
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
      </div>

      <Card className="p-0">
        <CardHeader
          title={t("assets.catalog.typesTitle")}
          subtitle={t("assets.catalog.typesSubtitle")}
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditor({ kind: "type", type: null })}
            >
              <Plus size={14} aria-hidden="true" />
              {t("assets.catalog.addType")}
            </Button>
          }
        />
        <ul className="divide-y divide-border/60">
          {catalog.types.map((type) => {
            const Icon = resolveAssetIcon(type.icon);
            const archived = type.archivedAt !== null;
            return (
              <li key={type.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-[13px]">
                    <Icon size={16} className="text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium text-foreground">
                      {localizedName(type, i18n.language)}
                    </span>
                    <code className="text-[11.5px] text-muted-foreground">{type.key}</code>
                    <Badge tone="neutral">{t(`assets.categories.${type.category}` as const)}</Badge>
                    {type.isUserSelectable ? (
                      <Badge tone="info">{t("assets.catalog.userSelectable")}</Badge>
                    ) : null}
                    {type.routingGroupId ? (
                      <Badge tone="neutral">
                        {t("assets.catalog.routingGroupBadge", {
                          group:
                            catalog.groups?.find((group) => group.id === type.routingGroupId)
                              ?.name ?? "—",
                        })}
                      </Badge>
                    ) : null}
                    {archived ? <Badge tone="warning">{t("assets.catalog.archived")}</Badge> : null}
                    <span className={hintClassName}>
                      {t("assets.catalog.assetCount", { count: type.assetCount })}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      className={rowActionButtonClassName}
                      aria-label={t("assets.catalog.editType", {
                        name: localizedName(type, i18n.language),
                      })}
                      onClick={() => setEditor({ kind: "type", type })}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={rowActionButtonClassName}
                      aria-label={t(
                        archived ? "assets.catalog.restore" : "assets.catalog.archive",
                        { name: localizedName(type, i18n.language) },
                      )}
                      onClick={() =>
                        void toggleArchived(() => setAssetTypeArchived(type.id, !archived))
                      }
                    >
                      {archived ? (
                        <ArchiveRestore size={14} aria-hidden="true" />
                      ) : (
                        <Archive size={14} aria-hidden="true" />
                      )}
                    </button>
                  </span>
                </div>
                <div className="mt-2 pl-6">
                  {type.attributes.length === 0 ? (
                    <p className={hintClassName}>{t("assets.catalog.noAttributes")}</p>
                  ) : (
                    <ul className="grid gap-1">
                      {type.attributes.map((attribute) => {
                        const attributeArchived = attribute.archivedAt !== null;
                        return (
                          <li
                            key={attribute.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]"
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-foreground">
                                {localizedLabel(attribute, i18n.language)}
                              </span>
                              <code className="text-[11.5px] text-muted-foreground">
                                {attribute.key}
                              </code>
                              <Badge tone="neutral">
                                {t(`assets.dataTypes.${attribute.dataType}` as const)}
                              </Badge>
                              {attribute.isRequired ? (
                                <Badge tone="primary">{t("assets.catalog.required")}</Badge>
                              ) : null}
                              {attribute.isUnique ? (
                                <Badge tone="accent">{t("assets.catalog.unique")}</Badge>
                              ) : null}
                              {attributeArchived ? (
                                <Badge tone="warning">{t("assets.catalog.archived")}</Badge>
                              ) : null}
                            </span>
                            <span className="flex items-center gap-1">
                              <button
                                type="button"
                                className={rowActionButtonClassName}
                                aria-label={t("assets.catalog.editAttribute", {
                                  name: localizedLabel(attribute, i18n.language),
                                })}
                                onClick={() => setEditor({ kind: "attribute", type, attribute })}
                              >
                                <Pencil size={14} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className={rowActionButtonClassName}
                                aria-label={t(
                                  attributeArchived
                                    ? "assets.catalog.restore"
                                    : "assets.catalog.archive",
                                  {
                                    name: localizedLabel(attribute, i18n.language),
                                  },
                                )}
                                onClick={() =>
                                  void toggleArchived(() =>
                                    setAssetAttributeArchived(attribute.id, !attributeArchived),
                                  )
                                }
                              >
                                {attributeArchived ? (
                                  <ArchiveRestore size={14} aria-hidden="true" />
                                ) : (
                                  <Archive size={14} aria-hidden="true" />
                                )}
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <Button
                    className="mt-2"
                    size="xs"
                    variant="ghost"
                    onClick={() => setEditor({ kind: "attribute", type, attribute: null })}
                  >
                    <Plus size={12} aria-hidden="true" />
                    {t("assets.catalog.addAttribute")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {locationsEnabled ? (
        <Card className="p-0">
          <CardHeader
            title={t("assets.catalog.locationsTitle")}
            subtitle={t("assets.catalog.locationsSubtitle")}
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditor({ kind: "location", location: null })}
              >
                <Plus size={14} aria-hidden="true" />
                {t("assets.catalog.addLocation")}
              </Button>
            }
          />
          {locationRows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<MapPin size={18} />}
                title={t("assets.catalog.noLocationsTitle")}
                body={t("assets.catalog.noLocationsBody")}
              />
            </div>
          ) : (
            <ul
              className="divide-y divide-border/60"
              aria-label={t("assets.catalog.locationsTitle")}
            >
              {locationRows.map((row) => (
                <li
                  key={row.location.id}
                  className="py-2 pr-4"
                  style={{ paddingLeft: `${16 + (row.depth - 1) * 20}px` }}
                >
                  <span className="sr-only">
                    {t("assets.catalog.locationLevel", { level: row.depth })}
                  </span>
                  <LocationRow
                    location={row.location}
                    onEdit={() => setEditor({ kind: "location", location: row.location })}
                    onAddChild={
                      row.depth < assetLocationDepthMax && row.location.archivedAt === null
                        ? () =>
                            setEditor({
                              kind: "location",
                              location: null,
                              parentId: row.location.id,
                            })
                        : undefined
                    }
                    onToggle={toggleArchived}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <AssetCatalogEditors.Type
        open={editor?.kind === "type"}
        type={editor?.kind === "type" ? editor.type : null}
        iconNames={catalog.iconNames}
        groups={catalog.groups ?? []}
        onOpenChange={(open) => (open ? undefined : setEditor(null))}
        onSaved={refresh}
      />
      <AssetCatalogEditors.Attribute
        open={editor?.kind === "attribute"}
        type={editor?.kind === "attribute" ? editor.type : null}
        attribute={editor?.kind === "attribute" ? editor.attribute : null}
        onOpenChange={(open) => (open ? undefined : setEditor(null))}
        onSaved={refresh}
      />
      <AssetCatalogEditors.Location
        open={editor?.kind === "location"}
        location={editor?.kind === "location" ? editor.location : null}
        initialParentId={editor?.kind === "location" ? (editor.parentId ?? null) : null}
        catalog={catalog}
        onOpenChange={(open) => (open ? undefined : setEditor(null))}
        onSaved={refresh}
      />
    </div>
  );
}

function LocationRow({
  location,
  onEdit,
  onAddChild,
  onToggle,
}: {
  readonly location: AssetLocation;
  readonly onEdit: () => void;
  readonly onAddChild?: () => void;
  readonly onToggle: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const archived = location.archivedAt !== null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-foreground">{location.name}</span>
        {location.code ? (
          <code className="text-[11.5px] text-muted-foreground">{location.code}</code>
        ) : null}
        {archived ? <Badge tone="warning">{t("assets.catalog.archived")}</Badge> : null}
        <span className={hintClassName}>
          {t("assets.catalog.assetCount", { count: location.assetCount })}
        </span>
      </span>
      <span className="flex items-center gap-1">
        {onAddChild ? (
          <button
            type="button"
            className={rowActionButtonClassName}
            aria-label={t("assets.catalog.addChildLocation", { name: location.name })}
            onClick={onAddChild}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          className={rowActionButtonClassName}
          aria-label={t("assets.catalog.editLocation", { name: location.name })}
          onClick={onEdit}
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={rowActionButtonClassName}
          aria-label={t(archived ? "assets.catalog.restore" : "assets.catalog.archive", {
            name: location.name,
          })}
          onClick={() => void onToggle(() => setAssetLocationArchived(location.id, !archived))}
        >
          {archived ? (
            <ArchiveRestore size={14} aria-hidden="true" />
          ) : (
            <Archive size={14} aria-hidden="true" />
          )}
        </button>
      </span>
    </div>
  );
}
