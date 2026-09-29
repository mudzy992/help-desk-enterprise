import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Network, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { errorTextClassName, hintClassName, rowActionButtonClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import {
  assetRelationKindKeys,
  assetStatusKeys,
  assetStatusTone,
  localizedName,
  mapAssetError,
  resolveAssetIcon,
} from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  addAssetRelation,
  assetQueryKeys,
  assetRelationKinds,
  getAssetImpact,
  lookupAssets,
  removeAssetRelation,
  type AssetDetail,
  type AssetImpactNode,
  type AssetRelation,
  type AssetRelationKind,
  type AssetRelationSummary,
} from "@/services/assets-api";

function AssetChip({ asset }: { readonly asset: AssetRelationSummary }) {
  const { t, i18n } = useTranslation();
  const Icon = resolveAssetIcon(asset.type.icon);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <Link to={`/assets/${asset.id}`} className="truncate font-medium text-foreground hover:underline">
        {asset.assetTag} · {asset.name}
      </Link>
      <span className="sr-only">{localizedName(asset.type, i18n.language)}</span>
      <Badge tone={assetStatusTone(asset.status)}>{t(assetStatusKeys[asset.status])}</Badge>
    </span>
  );
}

/** Paket 3.2 (§6): relations list, add/remove and the impact view. */
export function AssetRelationsPanel({ asset, onChanged }: { readonly asset: AssetDetail; readonly onChanged: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<AssetRelation | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const impactQuery = useQuery({ queryKey: assetQueryKeys.impact(asset.id), queryFn: () => getAssetImpact(asset.id), retry: false });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: assetQueryKeys.impact(asset.id) });
    onChanged();
  };

  async function confirmRemove() {
    if (removing === null) return;
    setRemovePending(true);
    setRemoveError(null);
    try {
      await removeAssetRelation(asset.id, removing.id);
      setRemoving(null);
      refresh();
    } catch (caught) {
      setRemoveError(t(mapAssetError(caught) ?? mapApiError(caught)));
    } finally {
      setRemovePending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-0">
        <CardHeader
          title={t("assets.relations.title")}
          subtitle={t("assets.relations.subtitle")}
          actions={
            asset.canManage ? (
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus size={14} aria-hidden="true" />
                {t("assets.relations.add")}
              </Button>
            ) : null
          }
        />
        <div className="p-4">
          {asset.relations.length === 0 ? (
            <EmptyState icon={<Network size={18} />} title={t("assets.relations.emptyTitle")} body={t("assets.relations.emptyBody")} />
          ) : (
            <ul className="grid gap-2">
              {asset.relations.map((relation) => (
                <li key={relation.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-[12.5px]">
                  <span className="grid min-w-0 gap-0.5">
                    <span className="text-[11.5px] text-muted-foreground">{t(assetRelationKindKeys[relation.kind][relation.direction])}</span>
                    <AssetChip asset={relation.asset} />
                  </span>
                  {asset.canManage ? (
                    <button
                      type="button"
                      className={rowActionButtonClassName}
                      aria-label={t("assets.relations.remove", { name: relation.asset.assetTag })}
                      onClick={() => {
                        setRemoveError(null);
                        setRemoving(relation);
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="p-0">
        <CardHeader title={t("assets.impact.title")} subtitle={t("assets.impact.subtitle")} />
        <div className="grid gap-4 p-4">
          {impactQuery.isLoading ? (
            <PanelSkeleton label={t("ui.loading")} />
          ) : impactQuery.error ? (
            <p role="alert" className={errorTextClassName}>
              {t(mapAssetError(impactQuery.error) ?? mapApiError(impactQuery.error))}
            </p>
          ) : impactQuery.data ? (
            <>
              <ImpactList title={t("assets.impact.dependents")} empty={t("assets.impact.noDependents")} group={impactQuery.data.dependents} />
              <ImpactList title={t("assets.impact.dependencies")} empty={t("assets.impact.noDependencies")} group={impactQuery.data.dependencies} />
            </>
          ) : null}
        </div>
      </Card>

      <AddRelationSheet open={addOpen} onOpenChange={setAddOpen} asset={asset} onDone={refresh} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title={t("assets.relations.removeTitle")}
        description={removing ? t("assets.relations.removeBody", { name: `${removing.asset.assetTag} · ${removing.asset.name}` }) : undefined}
        intent="danger"
        confirmLabel={t("assets.relations.removeConfirm")}
        isPending={removePending}
        onConfirm={() => void confirmRemove()}
      >
        {removeError ? (
          <p role="alert" className={errorTextClassName}>
            {removeError}
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function ImpactList({
  title,
  empty,
  group,
}: {
  readonly title: string;
  readonly empty: string;
  readonly group: { readonly items: readonly AssetImpactNode[]; readonly hidden: number };
}) {
  const { t } = useTranslation();
  return (
    <section>
      <h3 className="mb-2 text-[12.5px] font-semibold text-foreground">{title}</h3>
      {group.items.length === 0 && group.hidden === 0 ? (
        <p className={hintClassName}>{empty}</p>
      ) : (
        <ul className="grid gap-1.5">
          {group.items.map((node) => (
            <li key={node.assetId} className="flex items-center gap-2 text-[12.5px]" style={{ paddingLeft: `${(node.depth - 1) * 16}px` }}>
              <span className="sr-only">{t("assets.impact.depth", { depth: node.depth })}</span>
              <AssetChip asset={node.asset} />
            </li>
          ))}
        </ul>
      )}
      {group.hidden > 0 ? <p className={`mt-1 ${hintClassName}`}>{t("assets.impact.hidden", { count: group.hidden })}</p> : null}
    </section>
  );
}

function AddRelationSheet({
  open,
  onOpenChange,
  asset,
  onDone,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly asset: AssetDetail;
  readonly onDone: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<AssetRelationKind>("DEPENDS_ON");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKind("DEPENDS_ON");
      setSearchText("");
      setSearch("");
      setTargetId("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchText.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [searchText]);

  const lookupQuery = useQuery({
    queryKey: ["assets", "lookup", search, asset.id],
    queryFn: () => lookupAssets(search, asset.id),
    enabled: open && search.length >= 2,
    retry: false,
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (targetId === "") return;
    setPending(true);
    setError(null);
    try {
      await addAssetRelation(asset.id, targetId, kind);
      onDone();
      onOpenChange(false);
    } catch (caught) {
      setError(t(mapAssetError(caught) ?? mapApiError(caught)));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{t("assets.relations.add")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("assets.relations.addDescription", { name: `${asset.assetTag} · ${asset.name}` })}
        </SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field label={t("assets.relations.kind")} required>
            {(control) => (
              <Select {...control} value={kind} onChange={(event) => setKind(event.target.value as AssetRelationKind)}>
                {assetRelationKinds.map((value) => (
                  <option key={value} value={value}>
                    {t(assetRelationKindKeys[value].out)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("assets.relations.target")} hint={t("assets.relations.targetHint")}>
            {(control) => <Input {...control} type="search" autoComplete="off" value={searchText} onChange={(event) => setSearchText(event.target.value)} />}
          </Field>
          {search.length >= 2 ? (
            <fieldset className="grid gap-1">
              <legend className="sr-only">{t("assets.relations.results")}</legend>
              {lookupQuery.isLoading ? <p className={hintClassName}>{t("ui.loading")}</p> : null}
              {!lookupQuery.isLoading && (lookupQuery.data?.items.length ?? 0) === 0 ? <p className={hintClassName}>{t("assets.relations.noResults")}</p> : null}
              {(lookupQuery.data?.items ?? []).map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-[12.5px] has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input type="radio" name="asset-relation-target" value={item.id} checked={targetId === item.id} onChange={() => setTargetId(item.id)} />
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">
                      {item.assetTag} · {item.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{localizedName(item.type, i18n.language)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={pending || targetId === ""}>
              {pending ? t("ui.loading") : t("assets.relations.addSubmit")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
