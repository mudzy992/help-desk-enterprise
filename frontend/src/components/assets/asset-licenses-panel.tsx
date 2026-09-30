import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Eye, KeyRound, Plus, Search, Trash2 } from "lucide-react";
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
import { formatAssetDate, mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import {
  assetContractQueryKeys,
  assetQueryKeys,
  assignLicense,
  createLicense,
  deleteLicense,
  getAssetOptions,
  getLicense,
  listLicenses,
  lookupAssets,
  releaseLicense,
  revealLicenseKey,
  searchAssetUsers,
  softwareLicenseKinds,
  updateLicense,
  type SoftwareLicenseItem,
  type SoftwareLicenseKind,
} from "@/services/assets-api";

const searchDelayMs = 300;

function useDebounced(value: string, minLength = 2): string {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value.trim().length >= minLength ? value.trim() : ""), searchDelayMs);
    return () => window.clearTimeout(handle);
  }, [value, minLength]);
  return debounced;
}

/** Paket 3.2 (§9): licence register with compliance (used / seats). */
export function AssetLicensesPanel({ canManage }: { readonly canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const [searchText, setSearchText] = useState("");
  const search = useDebounced(searchText);
  const [kind, setKind] = useState<SoftwareLicenseKind | "">("");
  const [expiring, setExpiring] = useState(false);
  const [overAllocated, setOverAllocated] = useState(false);
  const [editing, setEditing] = useState<SoftwareLicenseItem | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({ search: search || undefined, kind: kind || undefined, expiringWithinDays: expiring ? 60 : undefined, overAllocated: overAllocated || undefined }),
    [search, kind, expiring, overAllocated],
  );
  const listQuery = useQuery({ queryKey: assetContractQueryKeys.licenses(filters), queryFn: () => listLicenses(filters), retry: false });
  const items = listQuery.data?.items ?? [];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2" role="search" aria-label={t("assets.licenses.filtersLabel")}>
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            className={`${controlCompactClassName} w-full pl-8`}
            aria-label={t("assets.licenses.searchLabel")}
            placeholder={t("assets.licenses.searchPlaceholder")}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <select
          className={selectCompactClassName}
          aria-label={t("assets.licenses.fields.kind")}
          value={kind}
          onChange={(event) => setKind(event.target.value as SoftwareLicenseKind | "")}
        >
          <option value="">{t("assets.licenses.allKinds")}</option>
          {softwareLicenseKinds.map((value) => (
            <option key={value} value={value}>
              {t(`assets.licenses.kinds.${value}` as const)}
            </option>
          ))}
        </select>
        <Checkbox label={t("assets.licenses.expiringFilter")} checked={expiring} onChange={(event) => setExpiring(event.target.checked)} />
        <Checkbox label={t("assets.licenses.overAllocatedFilter")} checked={overAllocated} onChange={(event) => setOverAllocated(event.target.checked)} />
        {canManage ? (
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => setEditing("new")}>
            <Plus size={14} aria-hidden="true" />
            {t("assets.licenses.create")}
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
        <EmptyState icon={<KeyRound size={18} />} title={t("assets.licenses.emptyTitle")} body={t("assets.licenses.emptyBody")} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className={tableWrapClassName}>
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">{t("assets.licenses.caption")}</caption>
              <thead>
                <tr className={tableHeadClassName}>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.licenses.fields.productName")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.licenses.fields.kind")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.licenses.fields.usage")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.licenses.fields.validUntil")}</th>
                  <th scope="col" className="px-3 py-2 text-left">{t("assets.fields.organizationalUnit")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={tableRowClassName}>
                    <td className="px-3 py-2">
                      <button type="button" className="text-left text-foreground underline-offset-2 hover:underline" onClick={() => setOpenId(item.id)}>
                        {item.productName}
                      </button>
                      {item.vendor ? <span className="block text-[11.5px] text-muted-foreground">{item.vendor}</span> : null}
                    </td>
                    <td className="px-3 py-2">{t(`assets.licenses.kinds.${item.kind}` as const)}</td>
                    <td className="px-3 py-2">
                      {item.seats === null ? (
                        t("assets.licenses.usageUnlimited", { used: item.used })
                      ) : (
                        <span className="flex items-center gap-1.5">
                          {t("assets.licenses.usage", { used: item.used, seats: item.seats })}
                          {item.overAllocated ? <Badge tone="danger">{t("assets.licenses.overAllocated")}</Badge> : null}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        {formatAssetDate(item.validUntil, i18n.language)}
                        <AssetExpiryBadge daysLeft={item.daysLeft} />
                      </span>
                    </td>
                    <td className="px-3 py-2">{item.organizationalUnit.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <LicenseFormSheet
        open={editing !== null}
        license={editing === "new" ? null : editing}
        onOpenChange={(open) => (open ? undefined : setEditing(null))}
      />
      <LicenseDetailSheet
        licenseId={openId}
        canManage={canManage}
        onOpenChange={(open) => (open ? undefined : setOpenId(null))}
        onEdit={(license) => {
          setOpenId(null);
          setEditing(license);
        }}
      />
    </div>
  );
}

function LicenseFormSheet({
  open,
  license,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly license: SoftwareLicenseItem | null;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const optionsQuery = useQuery({ queryKey: assetQueryKeys.options, queryFn: getAssetOptions, enabled: open, retry: false });
  const [productName, setProductName] = useState("");
  const [vendor, setVendor] = useState("");
  const [kind, setKind] = useState<SoftwareLicenseKind>("PER_DEVICE");
  const [seats, setSeats] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [unitId, setUnitId] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProductName(license?.productName ?? "");
    setVendor(license?.vendor ?? "");
    setKind(license?.kind ?? "PER_DEVICE");
    setSeats(license?.seats === null || license?.seats === undefined ? "" : String(license.seats));
    setValidUntil(license?.validUntil ?? "");
    setCost(license?.cost ?? "");
    setNotes(license?.notes ?? "");
    setUnitId(license?.organizationalUnit.id ?? "");
    setLicenseKey("");
    setRemoveKey(false);
    setError(null);
  }, [open, license]);

  const units = optionsQuery.data?.units ?? [];
  useEffect(() => {
    if (open && unitId === "" && units.length > 0) setUnitId(units[0].id);
  }, [open, unitId, units]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const money = parseMoneyInput(cost);
    const seatCount = kind === "SITE" ? null : seats.trim() === "" ? null : Number(seats);
    if (productName.trim() === "" || unitId === "") return setError(t("assets.licenses.errors.required"));
    if (kind !== "SITE" && (seatCount === null || !Number.isInteger(seatCount) || seatCount < 0)) return setError(t("assets.licenses.errors.seats"));
    if (kind === "SUBSCRIPTION" && validUntil === "") return setError(t("assets.licenses.errors.validUntil"));
    if (money === "invalid") return setError(t("assets.licenses.errors.cost"));
    const input = {
      productName: productName.trim(),
      vendor: vendor.trim() || null,
      kind,
      seats: seatCount,
      validUntil: validUntil || null,
      cost: money,
      notes: notes.trim() || null,
      organizationalUnitId: unitId,
      ...(removeKey ? { licenseKey: "" } : licenseKey.trim() !== "" ? { licenseKey: licenseKey.trim() } : {}),
    };
    setPending(true);
    setError(null);
    try {
      if (license === null) await createLicense(input);
      else await updateLicense(license.id, input);
      toast({ tone: "success", title: t("assets.licenses.saved") });
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
        <SheetTitle>{license === null ? t("assets.licenses.create") : t("assets.licenses.edit")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">{t("assets.licenses.formDescription")}</SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field label={t("assets.licenses.fields.productName")} required>
            {(control) => <Input {...control} maxLength={160} value={productName} onChange={(event) => setProductName(event.target.value)} />}
          </Field>
          <Field label={t("assets.licenses.fields.vendor")}>
            {(control) => <Input {...control} maxLength={120} value={vendor} onChange={(event) => setVendor(event.target.value)} />}
          </Field>
          <Field label={t("assets.licenses.fields.kind")} hint={t(`assets.licenses.kindHints.${kind}` as const)}>
            {(control) => (
              <Select {...control} value={kind} onChange={(event) => setKind(event.target.value as SoftwareLicenseKind)}>
                {softwareLicenseKinds.map((value) => (
                  <option key={value} value={value}>
                    {t(`assets.licenses.kinds.${value}` as const)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {kind !== "SITE" ? (
            <Field label={t("assets.licenses.fields.seats")} required>
              {(control) => (
                <Input {...control} type="number" min={0} step={1} inputMode="numeric" value={seats} onChange={(event) => setSeats(event.target.value)} />
              )}
            </Field>
          ) : null}
          <Field label={t("assets.licenses.fields.validUntil")} required={kind === "SUBSCRIPTION"}>
            {(control) => <Input {...control} type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />}
          </Field>
          <Field label={t("assets.licenses.fields.cost")}>
            {(control) => <Input {...control} inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />}
          </Field>
          <Field label={t("assets.fields.organizationalUnit")} required hint={t("assets.licenses.unitHint")}>
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
          <Field
            label={t("assets.licenses.fields.licenseKey")}
            hint={license?.hasKey ? t("assets.licenses.keyStoredHint") : t("assets.licenses.keyHint")}
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="off"
                maxLength={2000}
                disabled={removeKey}
                value={licenseKey}
                onChange={(event) => setLicenseKey(event.target.value)}
              />
            )}
          </Field>
          {license?.hasKey ? (
            <Checkbox label={t("assets.licenses.removeKey")} checked={removeKey} onChange={(event) => setRemoveKey(event.target.checked)} />
          ) : null}
          <Field label={t("assets.licenses.fields.notes")}>
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
              {pending ? t("ui.loading") : t("assets.licenses.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function LicenseDetailSheet({
  licenseId,
  canManage,
  onOpenChange,
  onEdit,
}: {
  readonly licenseId: string | null;
  readonly canManage: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onEdit: (license: SoftwareLicenseItem) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const open = licenseId !== null;
  const detailQuery = useQuery({
    queryKey: assetContractQueryKeys.license(licenseId ?? ""),
    queryFn: () => getLicense(licenseId ?? ""),
    enabled: open,
    retry: false,
  });
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [target, setTarget] = useState<"asset" | "user">("asset");
  const [searchText, setSearchText] = useState("");
  const search = useDebounced(searchText);

  useEffect(() => {
    setRevealed(null);
    setError(null);
    setSearchText("");
  }, [licenseId]);

  const license = detailQuery.data;
  const effectiveTarget = license?.assignmentTarget === "user" ? "user" : license?.assignmentTarget === "asset" ? "asset" : target;
  const candidatesQuery = useQuery({
    queryKey: ["assets", "license-candidates", effectiveTarget, search],
    queryFn: async () =>
      effectiveTarget === "asset"
        ? (await lookupAssets(search)).items.map((item) => ({ id: item.id, title: `${item.assetTag} · ${item.name}`, subtitle: item.assignedUser?.displayName ?? "" }))
        : (await searchAssetUsers(search)).items.map((item) => ({ id: item.id, title: item.displayName, subtitle: item.email })),
    enabled: open && canManage && search.length >= 2 && license !== undefined && license.assignmentTarget !== "none",
    retry: false,
  });

  async function run(action: () => Promise<unknown>, success?: string) {
    setPending(true);
    setError(null);
    try {
      await action();
      if (success) toast({ tone: "success", title: success });
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
        <SheetTitle>{license?.productName ?? t("assets.licenses.detailTitle")}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {license ? `${t(`assets.licenses.kinds.${license.kind}` as const)} · ${license.organizationalUnit.name}` : t("ui.loading")}
        </SheetDescription>
        {detailQuery.isLoading ? <PanelSkeleton label={t("ui.loading")} /> : null}
        {detailQuery.error ? (
          <p role="alert" className={`mt-3 ${errorTextClassName}`}>
            {t(mapAssetError(detailQuery.error) ?? mapApiError(detailQuery.error))}
          </p>
        ) : null}
        {license ? (
          <div className="mt-4 grid gap-4 text-[12.5px]">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">{t("assets.licenses.fields.vendor")}</dt>
              <dd>{license.vendor ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("assets.licenses.fields.usage")}</dt>
              <dd className="flex items-center gap-1.5">
                {license.seats === null
                  ? t("assets.licenses.usageUnlimited", { used: license.used })
                  : t("assets.licenses.usage", { used: license.used, seats: license.seats })}
                {license.overAllocated ? <Badge tone="danger">{t("assets.licenses.overAllocated")}</Badge> : null}
              </dd>
              <dt className="text-muted-foreground">{t("assets.licenses.fields.validUntil")}</dt>
              <dd className="flex items-center gap-1.5">
                {formatAssetDate(license.validUntil, i18n.language)} <AssetExpiryBadge daysLeft={license.daysLeft} />
              </dd>
              <dt className="text-muted-foreground">{t("assets.licenses.fields.cost")}</dt>
              <dd>{license.cost ?? "—"}</dd>
              <dt className="text-muted-foreground">{t("assets.licenses.fields.licenseKey")}</dt>
              <dd>
                {!license.hasKey ? (
                  "—"
                ) : revealed !== null ? (
                  <code className="break-all rounded bg-muted px-1.5 py-0.5 text-[12px]">{revealed}</code>
                ) : canManage ? (
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={pending}
                    onClick={() => void run(async () => setRevealed((await revealLicenseKey(license.id)).licenseKey))}
                  >
                    <Eye size={12} aria-hidden="true" />
                    {t("assets.licenses.reveal")}
                  </Button>
                ) : (
                  t("assets.licenses.keyHidden")
                )}
              </dd>
            </dl>
            {license.notes ? <p className="whitespace-pre-wrap text-muted-foreground">{license.notes}</p> : null}

            <section aria-labelledby="license-assignments-title" className="grid gap-2">
              <h3 id="license-assignments-title" className="text-[13px] font-semibold text-foreground">
                {t("assets.licenses.assignmentsTitle")}
              </h3>
              {license.assignmentTarget === "none" ? <p className={hintClassName}>{t("assets.licenses.siteHint")}</p> : null}
              {license.assignments.length === 0 && license.assignmentTarget !== "none" ? (
                <p className={hintClassName}>{t("assets.licenses.noAssignments")}</p>
              ) : null}
              <ul className="grid gap-1">
                {license.assignments.map((assignment) => (
                  <li key={assignment.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5">
                    <span className="min-w-0 truncate">
                      {assignment.asset ? (
                        <Link to={`/assets/${assignment.asset.id}`} className="text-foreground underline-offset-2 hover:underline">
                          {assignment.asset.assetTag} · {assignment.asset.name}
                        </Link>
                      ) : (
                        <>
                          {assignment.user?.displayName ?? "—"}
                          {assignment.user && !assignment.user.isActive ? (
                            <Badge tone="warning" className="ml-1">
                              {t("assets.licenses.inactiveUser")}
                            </Badge>
                          ) : null}
                        </>
                      )}
                    </span>
                    {canManage ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("assets.licenses.release")}
                        disabled={pending}
                        onClick={() => void run(() => releaseLicense(license.id, assignment.id), t("assets.licenses.released"))}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {canManage && license.assignmentTarget !== "none" ? (
                <div className="grid gap-2 rounded-md border border-dashed border-border p-3">
                  {license.assignmentTarget === "either" ? (
                    <Select aria-label={t("assets.licenses.assignTarget")} value={target} onChange={(event) => setTarget(event.target.value as "asset" | "user")}>
                      <option value="asset">{t("assets.licenses.targetAsset")}</option>
                      <option value="user">{t("assets.licenses.targetUser")}</option>
                    </Select>
                  ) : null}
                  <Input
                    type="search"
                    autoComplete="off"
                    aria-label={effectiveTarget === "asset" ? t("assets.licenses.searchAsset") : t("assets.licenses.searchUser")}
                    placeholder={effectiveTarget === "asset" ? t("assets.licenses.searchAsset") : t("assets.licenses.searchUser")}
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                  />
                  {(candidatesQuery.data ?? []).map((candidate) => (
                    <div key={candidate.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate">{candidate.title}</span>
                        {candidate.subtitle ? <span className="block truncate text-[11.5px] text-muted-foreground">{candidate.subtitle}</span> : null}
                      </span>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={pending}
                        onClick={() =>
                          void run(
                            () => assignLicense(license.id, effectiveTarget === "asset" ? { assetId: candidate.id } : { userId: candidate.id }),
                            t("assets.licenses.assigned"),
                          ).then((ok) => (ok ? setSearchText("") : undefined))
                        }
                      >
                        {t("assets.licenses.assign")}
                      </Button>
                    </div>
                  ))}
                  {search.length >= 2 && candidatesQuery.data?.length === 0 ? <p className={hintClassName}>{t("assets.licenses.noCandidates")}</p> : null}
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
                    if (!window.confirm(t("assets.licenses.confirmDelete"))) return;
                    void run(() => deleteLicense(license.id), t("assets.licenses.deleted")).then((ok) => (ok ? onOpenChange(false) : undefined));
                  }}
                >
                  {t("assets.licenses.delete")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => onEdit(license)}>
                  {t("assets.licenses.edit")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
