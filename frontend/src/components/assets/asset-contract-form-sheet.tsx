import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { buildContractInput } from "@/lib/assets/asset-commercial-drafts";
import { mapAssetError } from "@/lib/assets/asset-view";
import {
  entityMutationQueryKeys,
  invalidateEntityQueries,
} from "@/lib/entity-list/entity-mutation-query-keys";
import { mapApiError } from "@/lib/map-api-error";
import {
  assetContractKinds,
  assetQueryKeys,
  createContract,
  getAssetOptions,
  updateContract,
  type AssetContractItem,
  type AssetContractKind,
} from "@/services/assets-api";

export function ContractFormSheet({
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
  const optionsQuery = useQuery({
    queryKey: assetQueryKeys.options,
    queryFn: getAssetOptions,
    enabled: open,
    retry: false,
  });
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

  const units = useMemo(() => optionsQuery.data?.units ?? [], [optionsQuery.data?.units]);
  useEffect(() => {
    if (open && unitId === "" && units.length > 0) setUnitId(units[0].id);
  }, [open, unitId, units]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = buildContractInput({
      kind,
      supplier,
      reference,
      startsAt,
      endsAt,
      cost,
      notes,
      unitId,
    });
    if (!result.ok) {
      const key =
        result.error === "cost"
          ? "assets.licenses.errors.cost"
          : (`assets.contracts.errors.${result.error}` as const);
      return setError(t(key));
    }
    const input = result.input;
    setPending(true);
    setError(null);
    try {
      if (contract === null) await createContract(input);
      else await updateContract(contract.id, input);
      toast({ tone: "success", title: t("assets.contracts.saved") });
      void invalidateEntityQueries(queryClient, entityMutationQueryKeys.assets.contracts);
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
          {contract === null ? t("assets.contracts.create") : t("assets.contracts.edit")}
        </SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("assets.contracts.formDescription")}
        </SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field label={t("assets.contracts.fields.kind")}>
            {(control) => (
              <Select
                {...control}
                value={kind}
                onChange={(event) => setKind(event.target.value as AssetContractKind)}
              >
                {assetContractKinds.map((value) => (
                  <option key={value} value={value}>
                    {t(`assets.contracts.kinds.${value}` as const)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("assets.contracts.fields.supplier")} required>
            {(control) => (
              <Input
                {...control}
                maxLength={160}
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
              />
            )}
          </Field>
          <Field label={t("assets.contracts.fields.reference")}>
            {(control) => (
              <Input
                {...control}
                maxLength={120}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("assets.contracts.fields.startsAt")}>
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              )}
            </Field>
            <Field label={t("assets.contracts.fields.endsAt")} required>
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label={t("assets.contracts.fields.cost")}>
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
            hint={t("assets.contracts.unitHint")}
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
          <Field label={t("assets.contracts.fields.notes")}>
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
              {pending ? t("ui.loading") : t("assets.contracts.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
