import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
import { AssetExpiryBadge, parseMoneyInput } from "@/components/assets/asset-expiry-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  controlCompactClassName,
  errorTextClassName,
  hintClassName,
  selectCompactClassName,
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PanelSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { assetStatusKeys, assetStatusTone, formatAssetDate, mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  addContractItem,
  assetContractKinds,
  assetContractQueryKeys,
  assetQueryKeys,
  createContract,
  deleteContract,
  getAssetOptions,
  getContract,
  listContracts,
  lookupAssets,
  removeContractItem,
  updateContract,
  type AssetContractItem,
  type AssetContractKind,
} from "@/services/assets-api";

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value.trim().length >= 2 ? value.trim() : ""), 300);
    return () => window.clearTimeout(handle);
  }, [value]);
  return debounced;
}

/** Paket 3.2 (§10): warranty, support, lease and maintenance contracts. */
export function AssetContractsPanel({ canManage }: { readonly canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const search = useDebounced(searchText);
  const [kind, setKind] = useState<AssetContractKind | "">("");
  const [expiring, setExpiring] = useState(false);
  const [includeExpired, setIncludeExpired] = useState(false);
  const [editing, setEditing] = useState<AssetContractItem | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({ search: search || undefined, kind: kind || undefined, expiringWithinDays: expiring ? 60 : undefined, includeExpired: includeExpired || undefined }),
    [search, kind, expiring, includeExpired],
  );
  const listQuery = useQuery({ queryKey: assetContractQueryKeys.contracts(filters), queryFn: () => listContracts(filters), retry: false });
  const items = listQuery.data?.items ?? [];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2" role="search" aria-label={t("assets.contracts.filtersLabel")}>
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            className={`${controlCompactClassName} w-full pl-8`}
            aria-label={t("assets.contracts.searchLabel")}
            placeholder={t("assets.contracts.searchPlaceholder")}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <select
          className={selectCompactClassName}
          aria-label={t("assets.contracts.fields.kind")}
          value={kind}
          onChange={(event) => setKind(event.target.value as AssetContractKind | "")}
        >
          <option value="">{t("assets.contracts.allKinds")}</option>
          {assetContractKinds.map((value) => (
            <option key={value} value={value}>
              {t(`assets.contracts.kinds.${value}` as const)}
            </option>
          ))}
        </select>
        <Checkbox label={t("assets.contracts.expiringFilter")} checked={expiring} onChange={(event) => setExpiring(event.target.checked)} />
        <Checkbox label={t("assets.contracts.includeExpired")} checked={includeExpired} onChange={(event) => setIncludeExpired(event.target.checked)} />
        {canManage ? (
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => setEditing("new")}>
            <Plus size={14} aria-hidden="true" />
            {t("assets.contracts.create")}
          </Button>
        ) : null}
      </div>

      {listQuery.error ? (
        <p role="alert" className={errorTextClassName}>
          {t(mapAssetError(listQuery.error) ?? mapApiError(listQuery.error))}
        </p>
      ) : null}

      {listQuery.isLoading ? (
        <PanelSkeleton label={t("ui.loading")} />
      ) : items.length === 0 ? (
        <EmptyState icon={<FileText size={18} />} title={t("assets.contracts.emptyTitle")} body={t("assets.contracts.emptyBody")} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className={tableWrapClassName}>
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">{t("assets.contracts.caption")}</caption>
              <thead>
                <tr className={tableHeadClassName}>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.contracts.fields.supplier")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.contracts.fields.kind")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.contracts.fields.endsAt")}</th>
                  <th scope="col" className="px-3 py-2 text-right">{t("assets.contracts.fields.items")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.organizationalUnit")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={tableRowClassName}>
                    <td className="px-3 py-2">
                      <button type="button" className="text-left text-foreground underline-offset-2 hover:underline" onClick={() => setOpenId(item.id)}>
                        {item.supplier}
                      </button>
                      {item.reference ? <span className="block text-[11.5px] text-muted-foreground">{item.reference}</span> : null}
                    </td>
                    <td className="px-3 py-2">{t(`assets.contracts.kinds.${item.kind}` as const)}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {formatAssetDate(item.endsAt, i18n.language)}
                        <AssetExpiryBadge daysLeft={item.daysLeft} />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{item.itemCount}</td>
                    <td className="px-3 py-2">{item.organizationalUnit.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ContractFormSheet open={editing !== null} contract={editing === "new" ? null : editing} onOpenChange={(open) => (open ? undefined : setEditing(null))} />
      <ContractDetailSheet
        contractId={openId}
        canManage={canManage}
        onOpenChange={(open) => (open ? undefined : setOpenId(null))}
        onEdit={(contract) => {
          setOpenId(null);
          setEditing(contract);
        }}
      />
    </div>
  );
}

function ContractFormSheet({
  open,
  contract,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly contract: AssetContractItem | null;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const optionsQuery = useQuery({ queryKey: assetQueryKeys.options, queryFn: getAssetOptions, enabled: open, retry: false });
  const [kind, setKind] = useState<AssetContractKind>("WARRANTY");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [unitId, setUnitId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(contract?.kind ?? "WARRANTY");
    setSupplier(contract?.supplier ?? "");
    setReference(contract?.reference ?? "");
    setStartsAt(contract?.startsAt ?? "");
    setEndsAt(contract?.endsAt ?? "");
    setCost(contract?.cost ?? "");
    setNotes(contract?.notes ?? "");
    setUnitId(contract?.organizationalUnit.id ?? "");
    setError(null);
  }, [open, contract]);

  const units = optionsQuery.data?.units ?? [];
  useEffect(() => {
    if (open && unitId === "" && units.length > 0) setUnitId(units[0].id);
  }, [open, unitId, units]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const money = parseMoneyInput(cost);
    if (supplier.trim() === "" || endsAt === "" || unitId === "") return setError(t("assets.contracts.errors.required"));
    if (startsAt !== "" && startsAt > endsAt) return setError(t("assets.contracts.errors.dates"));
    if (money === "invalid") return setError(t("assets.licenses.errors.cost"));
    const input = {
      kind,
      supplier: supplier.trim(),
      reference: reference.trim() || null,
      startsAt: startsAt || null,
      endsAt,
      cost: money,
      notes: notes.trim() || null,
      organizationalUnitId: unitId,
    };
    setPending(true);
    setError(null);
    try {
      if (contract === null) await createContract(input);
      else await updateContract(contract.id, input);
      toast({ tone: "success", title: t("assets.contracts.saved") });
      void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
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
        <SheetTitle>{contract === null ? t("assets.contracts.create") : t("assets.contracts.edit")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">{t("assets.contracts.formDescription")}</SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field label={t("assets.contracts.fields.kind")}>
            {(control) => (
              <Select {...control} value={kind} onChange={(event) => setKind(event.target.value as AssetContractKind)}>
                {assetContractKinds.map((value) => (
                  <option key={value} value={value}>
                    {t(`assets.contracts.kinds.${value}` as const)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("assets.contracts.fields.supplier")} required>
            {(control) => <Input {...control} maxLength={160} value={supplier} onChange={(event) => setSupplier(event.target.value)} />}
          </Field>
          <Field label={t("assets.contracts.fields.reference")}>
            {(control) => <Input {...control} maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("assets.contracts.fields.startsAt")}>
              {(control) => <Input {...control} type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />}
            </Field>
            <Field label={t("assets.contracts.fields.endsAt")} required>
              {(control) => <Input {...control} type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />}
            </Field>
          </div>
          <Field label={t("assets.contracts.fields.cost")}>
            {(control) => <Input {...control} inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />}
          </Field>
          <Field label={t("assets.fields.organizationalUnit")} required hint={t("assets.contracts.unitHint")}>
            {(control) => (
              <Select {...control} value={unitId} onChange={(event) => setUnitId(event.target.value)}>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.path}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("assets.contracts.fields.notes")}>
            {(control) => <Textarea {...control} rows={3} maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} />}
          </Field>
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? t("ui.loading") : t("assets.contracts.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ContractDetailSheet({
  contractId,
  canManage,
  onOpenChange,
  onEdit,
}: {
  readonly contractId: string | null;
  readonly canManage: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onEdit: (contract: AssetContractItem) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const open = contractId !== null;
  const detailQuery = useQuery({
    queryKey: assetContractQueryKeys.contract(contractId ?? ""),
    queryFn: () => getContract(contractId ?? ""),
    enabled: open,
    retry: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [searchText, setSearchText] = useState("");
  const search = useDebounced(searchText);

  useEffect(() => {
    setError(null);
    setSearchText("");
  }, [contractId]);

  const contract = detailQuery.data;
  const candidatesQuery = useQuery({
    queryKey: ["assets", "contract-candidates", search],
    queryFn: () => lookupAssets(search),
    enabled: open && canManage && search.length >= 2,
    retry: false,
  });
  const linked = new Set(contract?.items.map((item) => item.id) ?? []);
  const candidates = (candidatesQuery.data?.items ?? []).filter((item) => !linked.has(item.id));

  async function run(action: () => Promise<unknown>, success: string) {
    setPending(true);
    setError(null);
    try {
      await action();
      toast({ tone: "success", title: success });
      void queryClient.invalidateQueries({ queryKey: assetQueryKeys.all });
      return true;
    } catch (caught) {
      setError(t(mapAssetError(caught) ?? mapApiError(caught)));
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetTitle>{contract?.supplier ?? t("assets.contracts.detailTitle")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {contract ? `${t(`assets.contracts.kinds.${contract.kind}` as const)} · ${contract.organizationalUnit.name}` : t("ui.loading")}
        </SheetDescription>
        {detailQuery.isLoading ? <PanelSkeleton label={t("ui.loading")} /> : null}
        {detailQuery.error ? (
          <p role="alert" className={`mt-3 ${errorTextClassName}`}>
            {t(mapAssetError(detailQuery.error) ?? mapApiError(detailQuery.error))}
          </p>
        ) : null}
        {contract ? (
          <div className="mt-4 grid gap-4 text-[12.5px]">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">{t("assets.contracts.fields.reference")}</dt>
              <dd>{contract.reference ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("assets.contracts.fields.startsAt")}</dt>
              <dd>{formatAssetDate(contract.startsAt, i18n.language)}</dd>
              <dt className="text-muted-foreground">{t("assets.contracts.fields.endsAt")}</dt>
              <dd className="flex items-center gap-1.5">
                {formatAssetDate(contract.endsAt, i18n.language)} <AssetExpiryBadge daysLeft={contract.daysLeft} />
              </dd>
              <dt className="text-muted-foreground">{t("assets.contracts.fields.cost")}</dt>
              <dd>{contract.cost ?? "—"}</dd>
            </dl>
            {contract.notes ? <p className="whitespace-pre-wrap text-muted-foreground">{contract.notes}</p> : null}

            <section aria-labelledby="contract-items-title" className="grid gap-2">
              <h3 id="contract-items-title" className="text-[13px] font-semibold text-foreground">
                {t("assets.contracts.itemsTitle", { count: contract.items.length })}
              </h3>
              {contract.items.length === 0 ? <p className={hintClassName}>{t("assets.contracts.noItems")}</p> : null}
              <ul className="grid gap-1">
                {contract.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {item.canOpen ? (
                        <Link to={`/assets/${item.id}`} className="truncate text-foreground underline-offset-2 hover:underline">
                          {item.assetTag} · {item.name}
                        </Link>
                      ) : (
                        <span className="truncate">
                          {item.assetTag} · {item.name}
                        </span>
                      )}
                      <Badge tone={assetStatusTone(item.status)}>{t(assetStatusKeys[item.status])}</Badge>
                    </span>
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("assets.contracts.removeItem")}
                        disabled={pending}
                        onClick={() => void run(() => removeContractItem(contract.id, item.id), t("assets.contracts.itemRemoved"))}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {canManage ? (
                <div className="grid gap-2 rounded-md border border-dashed border-border p-3">
                  <Input
                    type="search"
                    autoComplete="off"
                    aria-label={t("assets.contracts.searchAsset")}
                    placeholder={t("assets.contracts.searchAsset")}
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                  />
                  {candidates.map((candidate) => (
                    <div key={candidate.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {candidate.assetTag} · {candidate.name}
                      </span>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={pending}
                        onClick={() =>
                          void run(() => addContractItem(contract.id, candidate.id), t("assets.contracts.itemAdded")).then((ok) =>
                            ok ? setSearchText("") : undefined,
                          )
                        }
                      >
                        {t("assets.contracts.addItem")}
                      </Button>
                    </div>
                  ))}
                  {search.length >= 2 && candidatesQuery.data !== undefined && candidates.length === 0 ? (
                    <p className={hintClassName}>{t("assets.licenses.noCandidates")}</p>
                  ) : null}
                </div>
              ) : null}
            </section>

            {error ? (
              <p role="alert" className={errorTextClassName}>
                {error}
              </p>
            ) : null}
            {canManage ? (
              <div className="flex justify-between gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm(t("assets.contracts.confirmDelete"))) return;
                    void run(() => deleteContract(contract.id), t("assets.contracts.deleted")).then((ok) => (ok ? onOpenChange(false) : undefined));
                  }}
                >
                  {t("assets.contracts.delete")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => onEdit(contract)}>
                  {t("assets.contracts.edit")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
