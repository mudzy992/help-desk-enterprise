import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { buildLicenseInput } from "@/lib/assets/asset-commercial-drafts";
import { mapAssetError } from "@/lib/assets/asset-view";
import {
  entityMutationQueryKeys,
  invalidateEntityQueries,
} from "@/lib/entity-list/entity-mutation-query-keys";
import { mapApiError } from "@/lib/map-api-error";
import {
  assetQueryKeys,
  createLicense,
  getAssetOptions,
  softwareLicenseKinds,
  updateLicense,
  type SoftwareLicenseItem,
  type SoftwareLicenseKind,
} from "@/services/assets-api";

export function LicenseFormSheet({
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
  const optionsQuery = useQuery({
    queryKey: assetQueryKeys.options,
    queryFn: getAssetOptions,
    enabled: open,
    retry: false,
  });
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

  const units = useMemo(() => optionsQuery.data?.units ?? [], [optionsQuery.data?.units]);
  useEffect(() => {
    if (open && unitId === "" && units.length > 0) setUnitId(units[0].id);
  }, [open, unitId, units]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = buildLicenseInput({
      productName,
      vendor,
      kind,
      seats,
      validUntil,
      cost,
      notes,
      unitId,
      licenseKey,
      removeKey,
    });
    if (!result.ok) return setError(t(`assets.licenses.errors.${result.error}` as const));
    const input = result.input;
    setPending(true);
    setError(null);
    try {
      if (license === null) await createLicense(input);
      else await updateLicense(license.id, input);
      toast({ tone: "success", title: t("assets.licenses.saved") });
      void invalidateEntityQueries(queryClient, entityMutationQueryKeys.assets.licenses);
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
        <SheetTitle>
          {license === null ? t("assets.licenses.create") : t("assets.licenses.edit")}
        </SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("assets.licenses.formDescription")}
        </SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field label={t("assets.licenses.fields.productName")} required>
            {(control) => (
              <Input
                {...control}
                maxLength={160}
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
              />
            )}
          </Field>
          <Field label={t("assets.licenses.fields.vendor")}>
            {(control) => (
              <Input
                {...control}
                maxLength={120}
                value={vendor}
                onChange={(event) => setVendor(event.target.value)}
              />
            )}
          </Field>
          <Field
            label={t("assets.licenses.fields.kind")}
            hint={t(`assets.licenses.kindHints.${kind}` as const)}
          >
            {(control) => (
              <Select
                {...control}
                value={kind}
                onChange={(event) => setKind(event.target.value as SoftwareLicenseKind)}
              >
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
                <Input
                  {...control}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={seats}
                  onChange={(event) => setSeats(event.target.value)}
                />
              )}
            </Field>
          ) : null}
          <Field label={t("assets.licenses.fields.validUntil")} required={kind === "SUBSCRIPTION"}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={validUntil}
                onChange={(event) => setValidUntil(event.target.value)}
              />
            )}
          </Field>
          <Field label={t("assets.licenses.fields.cost")}>
            {(control) => (
              <Input
                {...control}
                inputMode="decimal"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
              />
            )}
          </Field>
          <Field
            label={t("assets.fields.organizationalUnit")}
            required
            hint={t("assets.licenses.unitHint")}
          >
            {(control) => (
              <Select
                {...control}
                value={unitId}
                onChange={(event) => setUnitId(event.target.value)}
              >
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
            hint={
              license?.hasKey ? t("assets.licenses.keyStoredHint") : t("assets.licenses.keyHint")
            }
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
            <Checkbox
              label={t("assets.licenses.removeKey")}
              checked={removeKey}
              onChange={(event) => setRemoveKey(event.target.checked)}
            />
          ) : null}
          <Field label={t("assets.licenses.fields.notes")}>
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                maxLength={4000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            )}
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
