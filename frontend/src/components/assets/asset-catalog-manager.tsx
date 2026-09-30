import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Archive, ArchiveRestore, MapPin, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName, rowActionButtonClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  assetErrorDetail,
  assetLocationDepthMax,
  flattenLocationTree,
  localizedLabel,
  localizedName,
  locationHeight,
  locationSubtree,
  mapAssetError,
  resolveAssetIcon,
} from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { useAssetLocationsEnabled } from "@/lib/assets/use-asset-locations-enabled";
import {
  assetAttributeDataTypes,
  assetCategories,
  assetQueryKeys,
  createAssetAttribute,
  createAssetLocation,
  createAssetType,
  getAssetCatalog,
  setAssetAttributeArchived,
  setAssetLocationArchived,
  setAssetTypeArchived,
  updateAssetAttribute,
  updateAssetLocation,
  updateAssetType,
  type AssetAttribute,
  type AssetAttributeDataType,
  type AssetCatalog,
  type AssetCategory,
  type AssetLocation,
  type AssetType,
} from "@/services/assets-api";

type Editor =
  | { readonly kind: "type"; readonly type: AssetType | null }
  | { readonly kind: "attribute"; readonly type: AssetType; readonly attribute: AssetAttribute | null }
  | { readonly kind: "location"; readonly location: AssetLocation | null; readonly parentId?: string }
  | null;

function useErrorText() {
  const { t } = useTranslation();
  return (caught: unknown) => {
    const detail = assetErrorDetail(caught);
    const message = t(mapAssetError(caught) ?? mapApiError(caught));
    return detail ? `${message} (${detail})` : message;
  };
}

/** Paket 3.2 (§4, §7, §17.7): types with attributes, and locations (asset.type.manage). */
export function AssetCatalogManager() {
  const { t, i18n } = useTranslation();
  const locationsEnabled = useAssetLocationsEnabled();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const errorText = useErrorText();
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const catalogQuery = useQuery({ queryKey: assetQueryKeys.catalog(showArchived), queryFn: () => getAssetCatalog(showArchived), retry: false });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });

  async function toggleArchived(action: () => Promise<unknown>) {
    try {
      await action();
      refresh();
    } catch (caught) {
      toast({ tone: "danger", title: t("assets.catalog.actionFailed"), description: errorText(caught) });
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
        <Checkbox label={t("assets.catalog.showArchived")} checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
      </div>

      <Card className="p-0">
        <CardHeader
          title={t("assets.catalog.typesTitle")}
          subtitle={t("assets.catalog.typesSubtitle")}
          actions={
            <Button size="sm" variant="outline" onClick={() => setEditor({ kind: "type", type: null })}>
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
                    <span className="font-medium text-foreground">{localizedName(type, i18n.language)}</span>
                    <code className="text-[11.5px] text-muted-foreground">{type.key}</code>
                    <Badge tone="neutral">{t(`assets.categories.${type.category}` as const)}</Badge>
                    {type.isUserSelectable ? <Badge tone="info">{t("assets.catalog.userSelectable")}</Badge> : null}
                    {type.routingGroupId ? (
                      <Badge tone="neutral">
                        {t("assets.catalog.routingGroupBadge", { group: catalog.groups?.find((group) => group.id === type.routingGroupId)?.name ?? "—" })}
                      </Badge>
                    ) : null}
                    {archived ? <Badge tone="warning">{t("assets.catalog.archived")}</Badge> : null}
                    <span className={hintClassName}>{t("assets.catalog.assetCount", { count: type.assetCount })}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      className={rowActionButtonClassName}
                      aria-label={t("assets.catalog.editType", { name: localizedName(type, i18n.language) })}
                      onClick={() => setEditor({ kind: "type", type })}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={rowActionButtonClassName}
                      aria-label={t(archived ? "assets.catalog.restore" : "assets.catalog.archive", { name: localizedName(type, i18n.language) })}
                      onClick={() => void toggleArchived(() => setAssetTypeArchived(type.id, !archived))}
                    >
                      {archived ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
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
                          <li key={attribute.id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-foreground">{localizedLabel(attribute, i18n.language)}</span>
                              <code className="text-[11.5px] text-muted-foreground">{attribute.key}</code>
                              <Badge tone="neutral">{t(`assets.dataTypes.${attribute.dataType}` as const)}</Badge>
                              {attribute.isRequired ? <Badge tone="primary">{t("assets.catalog.required")}</Badge> : null}
                              {attribute.isUnique ? <Badge tone="accent">{t("assets.catalog.unique")}</Badge> : null}
                              {attributeArchived ? <Badge tone="warning">{t("assets.catalog.archived")}</Badge> : null}
                            </span>
                            <span className="flex items-center gap-1">
                              <button
                                type="button"
                                className={rowActionButtonClassName}
                                aria-label={t("assets.catalog.editAttribute", { name: localizedLabel(attribute, i18n.language) })}
                                onClick={() => setEditor({ kind: "attribute", type, attribute })}
                              >
                                <Pencil size={14} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className={rowActionButtonClassName}
                                aria-label={t(attributeArchived ? "assets.catalog.restore" : "assets.catalog.archive", {
                                  name: localizedLabel(attribute, i18n.language),
                                })}
                                onClick={() => void toggleArchived(() => setAssetAttributeArchived(attribute.id, !attributeArchived))}
                              >
                                {attributeArchived ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <Button className="mt-2" size="xs" variant="ghost" onClick={() => setEditor({ kind: "attribute", type, attribute: null })}>
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
            <Button size="sm" variant="outline" onClick={() => setEditor({ kind: "location", location: null })}>
              <Plus size={14} aria-hidden="true" />
              {t("assets.catalog.addLocation")}
            </Button>
          }
        />
        {locationRows.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<MapPin size={18} />} title={t("assets.catalog.noLocationsTitle")} body={t("assets.catalog.noLocationsBody")} />
          </div>
        ) : (
          <ul className="divide-y divide-border/60" aria-label={t("assets.catalog.locationsTitle")}>
            {locationRows.map((row) => (
              <li key={row.location.id} className="py-2 pr-4" style={{ paddingLeft: `${16 + (row.depth - 1) * 20}px` }}>
                <span className="sr-only">{t("assets.catalog.locationLevel", { level: row.depth })}</span>
                <LocationRow
                  location={row.location}
                  onEdit={() => setEditor({ kind: "location", location: row.location })}
                  onAddChild={
                    row.depth < assetLocationDepthMax && row.location.archivedAt === null
                      ? () => setEditor({ kind: "location", location: null, parentId: row.location.id })
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

      <TypeEditor
        open={editor?.kind === "type"}
        type={editor?.kind === "type" ? editor.type : null}
        iconNames={catalog.iconNames}
        groups={catalog.groups ?? []}
        onOpenChange={(open) => (open ? undefined : setEditor(null))}
        onSaved={refresh}
      />
      <AttributeEditor
        open={editor?.kind === "attribute"}
        type={editor?.kind === "attribute" ? editor.type : null}
        attribute={editor?.kind === "attribute" ? editor.attribute : null}
        onOpenChange={(open) => (open ? undefined : setEditor(null))}
        onSaved={refresh}
      />
      <LocationEditor
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
        {location.code ? <code className="text-[11.5px] text-muted-foreground">{location.code}</code> : null}
        {archived ? <Badge tone="warning">{t("assets.catalog.archived")}</Badge> : null}
        <span className={hintClassName}>{t("assets.catalog.assetCount", { count: location.assetCount })}</span>
      </span>
      <span className="flex items-center gap-1">
        {onAddChild ? (
          <button type="button" className={rowActionButtonClassName} aria-label={t("assets.catalog.addChildLocation", { name: location.name })} onClick={onAddChild}>
            <Plus size={14} aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" className={rowActionButtonClassName} aria-label={t("assets.catalog.editLocation", { name: location.name })} onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={rowActionButtonClassName}
          aria-label={t(archived ? "assets.catalog.restore" : "assets.catalog.archive", { name: location.name })}
          onClick={() => void onToggle(() => setAssetLocationArchived(location.id, !archived))}
        >
          {archived ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}
        </button>
      </span>
    </div>
  );
}

function EditorFooter({ pending, disabled, onCancel }: { readonly pending: boolean; readonly disabled: boolean; readonly onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        {t("ui.cancel")}
      </Button>
      <Button type="submit" variant="primary" disabled={pending || disabled}>
        {pending ? t("ui.loading") : t("assets.form.save")}
      </Button>
    </div>
  );
}

/** Mirror backend assetKeyPattern / assetAttributeKeyPattern. */
const typeKeyPattern = /^[a-z][a-z0-9-]{1,47}$/;
const attributeKeyPattern = /^[a-z][A-Za-z0-9]{0,47}$/;

function TypeEditor({
  open,
  type,
  iconNames,
  groups,
  onOpenChange,
  onSaved,
}: {
  readonly open: boolean;
  readonly type: AssetType | null;
  readonly iconNames: readonly string[];
  readonly groups: readonly { readonly id: string; readonly name: string }[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [key, setKey] = useState("");
  const [nameBs, setNameBs] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [icon, setIcon] = useState("box");
  const [category, setCategory] = useState<AssetCategory>("HARDWARE");
  const [isUserSelectable, setIsUserSelectable] = useState(true);
  const [routingGroupId, setRoutingGroupId] = useState("");
  const [sortOrder, setSortOrder] = useState("100");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKey(type?.key ?? "");
    setNameBs(type?.nameBs ?? "");
    setNameEn(type?.nameEn ?? "");
    setIcon(type?.icon ?? "box");
    setCategory(type?.category ?? "HARDWARE");
    setIsUserSelectable(type?.isUserSelectable ?? true);
    setRoutingGroupId(type?.routingGroupId ?? "");
    setSortOrder(String(type?.sortOrder ?? 100));
    setError(null);
  }, [open, type]);

  const keyInvalid = type === null && !typeKeyPattern.test(key);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const input = { nameBs: nameBs.trim(), nameEn: nameEn.trim(), icon, category, isUserSelectable, routingGroupId: routingGroupId || null, sortOrder: Number.parseInt(sortOrder, 10) || 0 };
    try {
      if (type === null) await createAssetType({ ...input, key });
      else await updateAssetType(type.id, input);
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{type === null ? t("assets.catalog.addType") : t("assets.catalog.editTypeTitle")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">{t("assets.catalog.typeDescription")}</SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field label={t("assets.catalog.key")} required hint={t("assets.catalog.keyHint")} error={key.length > 0 && keyInvalid ? t("assets.catalog.keyInvalid") : null}>
            {(control) => <Input {...control} value={key} maxLength={48} disabled={type !== null} onChange={(event) => setKey(event.target.value)} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("assets.catalog.nameBs")} required>
              {(control) => <Input {...control} value={nameBs} maxLength={80} onChange={(event) => setNameBs(event.target.value)} />}
            </Field>
            <Field label={t("assets.catalog.nameEn")} required>
              {(control) => <Input {...control} value={nameEn} maxLength={80} onChange={(event) => setNameEn(event.target.value)} />}
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("assets.catalog.category")}>
              {(control) => (
                <Select {...control} value={category} onChange={(event) => setCategory(event.target.value as AssetCategory)}>
                  {assetCategories.map((value) => (
                    <option key={value} value={value}>
                      {t(`assets.categories.${value}` as const)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("assets.catalog.icon")}>
              {(control) => (
                <Select {...control} value={icon} onChange={(event) => setIcon(event.target.value)}>
                  {iconNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label={t("assets.catalog.sortOrder")}>
            {(control) => <Input {...control} inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value.replace(/\D/g, ""))} />}
          </Field>
          <Checkbox label={t("assets.catalog.userSelectableLabel")} checked={isUserSelectable} onChange={(event) => setIsUserSelectable(event.target.checked)} />
          <p className={hintClassName}>{t("assets.catalog.userSelectableHint")}</p>
          <Field label={t("assets.catalog.routingGroup")} hint={t("assets.catalog.routingGroupHint")}>
            {(control) => (
              <Select {...control} value={routingGroupId} onChange={(event) => setRoutingGroupId(event.target.value)}>
                <option value="">{t("assets.catalog.routingGroupNone")}</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <EditorFooter pending={pending} disabled={keyInvalid || nameBs.trim() === "" || nameEn.trim() === ""} onCancel={() => onOpenChange(false)} />
        </form>
      </SheetContent>
    </Sheet>
  );
}

function AttributeEditor({
  open,
  type,
  attribute,
  onOpenChange,
  onSaved,
}: {
  readonly open: boolean;
  readonly type: AssetType | null;
  readonly attribute: AssetAttribute | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const errorText = useErrorText();
  const [key, setKey] = useState("");
  const [labelBs, setLabelBs] = useState("");
  const [labelEn, setLabelEn] = useState("");
  const [dataType, setDataType] = useState<AssetAttributeDataType>("TEXT");
  const [options, setOptions] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [isUnique, setIsUnique] = useState(false);
  const [sortOrder, setSortOrder] = useState("100");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKey(attribute?.key ?? "");
    setLabelBs(attribute?.labelBs ?? "");
    setLabelEn(attribute?.labelEn ?? "");
    setDataType(attribute?.dataType ?? "TEXT");
    setOptions((attribute?.options ?? []).join("\n"));
    setIsRequired(attribute?.isRequired ?? false);
    setIsUnique(attribute?.isUnique ?? false);
    setSortOrder(String(attribute?.sortOrder ?? 100));
    setError(null);
  }, [open, attribute]);

  if (type === null) return null;
  const keyInvalid = attribute === null && !attributeKeyPattern.test(key);
  const optionList = options
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (type === null) return;
    setPending(true);
    setError(null);
    const input = {
      labelBs: labelBs.trim(),
      labelEn: labelEn.trim(),
      dataType,
      options: dataType === "SELECT" ? optionList : undefined,
      isRequired,
      isUnique,
      sortOrder: Number.parseInt(sortOrder, 10) || 0,
    };
    try {
      if (attribute === null) await createAssetAttribute(type.id, { ...input, key });
      else await updateAssetAttribute(attribute.id, input);
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{attribute === null ? t("assets.catalog.addAttribute") : t("assets.catalog.editAttributeTitle")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("assets.catalog.attributeDescription", { type: localizedName(type, i18n.language) })}
        </SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field label={t("assets.catalog.key")} required hint={t("assets.catalog.attributeKeyHint")} error={key.length > 0 && keyInvalid ? t("assets.catalog.keyInvalid") : null}>
            {(control) => <Input {...control} value={key} maxLength={48} disabled={attribute !== null} onChange={(event) => setKey(event.target.value)} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("assets.catalog.labelBs")} required>
              {(control) => <Input {...control} value={labelBs} maxLength={80} onChange={(event) => setLabelBs(event.target.value)} />}
            </Field>
            <Field label={t("assets.catalog.labelEn")} required>
              {(control) => <Input {...control} value={labelEn} maxLength={80} onChange={(event) => setLabelEn(event.target.value)} />}
            </Field>
          </div>
          <Field label={t("assets.catalog.dataType")} hint={attribute !== null ? t("assets.catalog.dataTypeHint") : undefined}>
            {(control) => (
              <Select {...control} value={dataType} onChange={(event) => setDataType(event.target.value as AssetAttributeDataType)}>
                {assetAttributeDataTypes.map((value) => (
                  <option key={value} value={value}>
                    {t(`assets.dataTypes.${value}` as const)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {dataType === "SELECT" ? (
            <Field label={t("assets.catalog.options")} required hint={t("assets.catalog.optionsHint")}>
              {(control) => <Textarea {...control} rows={4} value={options} onChange={(event) => setOptions(event.target.value)} />}
            </Field>
          ) : null}
          <Field label={t("assets.catalog.sortOrder")}>
            {(control) => <Input {...control} inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value.replace(/\D/g, ""))} />}
          </Field>
          <Checkbox label={t("assets.catalog.requiredLabel")} checked={isRequired} onChange={(event) => setIsRequired(event.target.checked)} />
          <Checkbox label={t("assets.catalog.uniqueLabel")} checked={isUnique} onChange={(event) => setIsUnique(event.target.checked)} />
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <EditorFooter
            pending={pending}
            disabled={keyInvalid || labelBs.trim() === "" || labelEn.trim() === "" || (dataType === "SELECT" && optionList.length === 0)}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}

function LocationEditor({
  open,
  location,
  initialParentId,
  catalog,
  onOpenChange,
  onSaved,
}: {
  readonly open: boolean;
  readonly location: AssetLocation | null;
  readonly initialParentId: string | null;
  readonly catalog: AssetCatalog;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSaved: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [parentId, setParentId] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState("100");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setParentId(location?.parentId ?? initialParentId ?? "");
    setName(location?.name ?? "");
    setCode(location?.code ?? "");
    setSortOrder(String(location?.sortOrder ?? 100));
    setError(null);
  }, [open, location, initialParentId]);

  // §7: any location may be a parent, except the location itself, its own
  // sub-locations (no cycles) and parents that would exceed the depth limit.
  const rows = flattenLocationTree(catalog.locations);
  const excluded = location === null ? new Set<string>() : locationSubtree(catalog.locations, location.id);
  const ownHeight = location === null ? 0 : locationHeight(catalog.locations, location.id);
  const parentOptions = rows.filter(
    (row) =>
      !excluded.has(row.location.id) &&
      (row.location.archivedAt === null || row.location.id === parentId) &&
      row.depth + 1 + ownHeight <= assetLocationDepthMax,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const input = { parentId: parentId || null, name: name.trim(), code: code.trim() || null, sortOrder: Number.parseInt(sortOrder, 10) || 0 };
    try {
      if (location === null) await createAssetLocation(input);
      else await updateAssetLocation(location.id, input);
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{location === null ? t("assets.catalog.addLocation") : t("assets.catalog.editLocationTitle")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">{t("assets.catalog.locationDescription")}</SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field label={t("assets.catalog.parentLocation")} hint={t("assets.catalog.parentHint", { max: assetLocationDepthMax })}>
            {(control) => (
              <Select {...control} value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value="">{t("assets.catalog.topLevel")}</option>
                {parentOptions.map((row) => (
                  <option key={row.location.id} value={row.location.id}>
                    {row.path}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("assets.catalog.locationName")} required>
            {(control) => <Input {...control} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("assets.catalog.locationCode")} hint={t("assets.catalog.locationCodeHint")}>
              {(control) => <Input {...control} value={code} maxLength={32} onChange={(event) => setCode(event.target.value)} />}
            </Field>
            <Field label={t("assets.catalog.sortOrder")}>
              {(control) => <Input {...control} inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value.replace(/\D/g, ""))} />}
            </Field>
          </div>
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <EditorFooter pending={pending} disabled={name.trim() === ""} onCancel={() => onOpenChange(false)} />
        </form>
      </SheetContent>
    </Sheet>
  );
}
