import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName, sectionTitleClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { assetErrorDetail, flattenLocationTree, localizedLabel, localizedName, mapAssetError } from "@/lib/assets/asset-view";
import { mapApiError } from "@/lib/map-api-error";
import { useAssetLocationsEnabled } from "@/lib/assets/use-asset-locations-enabled";
import {
  createAsset,
  updateAsset,
  type AssetCatalog,
  type AssetDetail,
  type AssetOptions,
  type AssetWriteInput,
} from "@/services/assets-api";

interface AssetFormSheetProperties {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly catalog: AssetCatalog;
  readonly options: AssetOptions;
  /** Edit when given; "duplicate" copies it without tag, serial and assignment. */
  readonly asset?: AssetDetail | null;
  readonly duplicate?: boolean;
  readonly onSaved: (id: string) => void;
}

type FormState = {
  assetTag: string;
  typeId: string;
  name: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  organizationalUnitId: string;
  locationId: string;
  serviceId: string;
  purchaseDate: string;
  purchaseCost: string;
  supplier: string;
  warrantyEndsAt: string;
  notes: string;
  attributes: Record<string, string | boolean>;
};

function initialState(catalog: AssetCatalog, options: AssetOptions, asset: AssetDetail | null | undefined, duplicate: boolean): FormState {
  const attributes: Record<string, string | boolean> = {};
  if (asset) {
    for (const [key, value] of Object.entries(asset.attributes)) {
      attributes[key] = typeof value === "boolean" ? value : value === null || value === undefined ? "" : String(value);
    }
  }
  return {
    assetTag: asset && !duplicate ? asset.assetTag : "",
    typeId: asset?.type.id ?? catalog.types.find((type) => type.archivedAt === null)?.id ?? "",
    name: asset?.name ?? "",
    serialNumber: asset && !duplicate ? (asset.serialNumber ?? "") : "",
    manufacturer: asset?.manufacturer ?? "",
    model: asset?.model ?? "",
    organizationalUnitId: asset?.organizationalUnit.id ?? options.units[0]?.id ?? "",
    locationId: asset?.location?.id ?? "",
    serviceId: asset?.service?.id ?? "",
    purchaseDate: asset?.purchaseDate ?? "",
    purchaseCost: asset?.purchaseCost === null || asset?.purchaseCost === undefined ? "" : String(asset.purchaseCost),
    supplier: asset?.supplier ?? "",
    warrantyEndsAt: asset?.warrantyEndsAt ?? "",
    notes: asset?.notes ?? "",
    attributes,
  };
}

const nullable = (value: string): string | null => (value.trim().length === 0 ? null : value.trim());

/**
 * Paket 3.2 (§3, §4, §17): create, edit or duplicate an asset. Attributes
 * follow the selected type; the server validates types, uniqueness and scope.
 */
export function AssetFormSheet({ open, onOpenChange, catalog, options, asset, duplicate = false, onSaved }: AssetFormSheetProperties) {
  const { t, i18n } = useTranslation();
  const isEdit = asset !== null && asset !== undefined && !duplicate;
  const [state, setState] = useState<FormState>(() => initialState(catalog, options, asset, duplicate));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setState(initialState(catalog, options, asset, duplicate));
      setError(null);
    }
  }, [open, catalog, options, asset, duplicate]);

  const selectedType = catalog.types.find((type) => type.id === state.typeId) ?? null;
  const attributes = useMemo(
    () => (selectedType?.attributes ?? []).filter((attribute) => attribute.archivedAt === null),
    [selectedType],
  );
  const locationsEnabled = useAssetLocationsEnabled();
  const locationRows = useMemo(() => flattenLocationTree(catalog.locations), [catalog.locations]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((current) => ({ ...current, [key]: value }));
  const setAttribute = (key: string, value: string | boolean) =>
    setState((current) => ({ ...current, attributes: { ...current.attributes, [key]: value } }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const cost = state.purchaseCost.trim().replace(",", ".");
    const attributeValues: Record<string, unknown> = {};
    for (const attribute of attributes) {
      const value = state.attributes[attribute.key];
      if (attribute.dataType === "BOOLEAN") attributeValues[attribute.key] = value === true;
      else attributeValues[attribute.key] = typeof value === "string" ? value : "";
    }
    const input: AssetWriteInput = {
      assetTag: nullable(state.assetTag),
      typeId: state.typeId,
      name: state.name.trim(),
      serialNumber: nullable(state.serialNumber),
      manufacturer: nullable(state.manufacturer),
      model: nullable(state.model),
      organizationalUnitId: state.organizationalUnitId,
      locationId: nullable(state.locationId),
      serviceId: nullable(state.serviceId),
      purchaseDate: nullable(state.purchaseDate),
      purchaseCost: cost.length === 0 ? null : Number(cost),
      supplier: nullable(state.supplier),
      warrantyEndsAt: nullable(state.warrantyEndsAt),
      notes: nullable(state.notes),
      attributes: attributeValues,
      ...(isEdit ? { version: asset.version } : {}),
    };
    if (input.purchaseCost !== null && input.purchaseCost !== undefined && !Number.isFinite(input.purchaseCost)) {
      setError(t("assets.form.invalidCost"));
      setPending(false);
      return;
    }
    try {
      if (isEdit) {
        await updateAsset(asset.id, input);
        onSaved(asset.id);
      } else {
        const created = await createAsset(input);
        onSaved(created.id);
      }
      onOpenChange(false);
    } catch (caught) {
      const detail = assetErrorDetail(caught);
      const message = t(mapAssetError(caught) ?? mapApiError(caught));
      setError(detail ? `${message} (${detail})` : message);
    } finally {
      setPending(false);
    }
  }

  const title = isEdit ? t("assets.form.editTitle") : duplicate ? t("assets.form.duplicateTitle") : t("assets.form.createTitle");
  const directoryLocked = isEdit && asset.source === "DIRECTORY";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full max-w-xl flex-col overflow-y-auto p-5">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">{t("assets.form.description")}</SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("assets.fields.type")} required>
              {(control) => (
                <Select {...control} value={state.typeId} onChange={(event) => set("typeId", event.target.value)} required>
                  {catalog.types
                    .filter((type) => type.archivedAt === null || type.id === state.typeId)
                    .map((type) => (
                      <option key={type.id} value={type.id}>
                        {localizedName(type, i18n.language)}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <Field label={t("assets.fields.assetTag")} hint={isEdit ? undefined : t("assets.form.tagHint")}>
              {(control) => (
                <Input {...control} value={state.assetTag} maxLength={64} onChange={(event) => set("assetTag", event.target.value)} />
              )}
            </Field>
          </div>
          <Field label={t("assets.fields.name")} required hint={directoryLocked ? t("assets.form.directoryNameHint") : undefined}>
            {(control) => (
              <Input
                {...control}
                value={state.name}
                maxLength={160}
                required
                readOnly={directoryLocked}
                onChange={(event) => set("name", event.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("assets.fields.manufacturer")}>
              {(control) => <Input {...control} value={state.manufacturer} maxLength={120} onChange={(event) => set("manufacturer", event.target.value)} />}
            </Field>
            <Field label={t("assets.fields.model")}>
              {(control) => <Input {...control} value={state.model} maxLength={120} onChange={(event) => set("model", event.target.value)} />}
            </Field>
            <Field label={t("assets.fields.serialNumber")}>
              {(control) => <Input {...control} value={state.serialNumber} maxLength={120} onChange={(event) => set("serialNumber", event.target.value)} />}
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("assets.fields.organizationalUnit")} required>
              {(control) => (
                <Select {...control} value={state.organizationalUnitId} onChange={(event) => set("organizationalUnitId", event.target.value)} required>
                  {options.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.path}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {locationsEnabled ? (
            <Field label={t("assets.fields.location")}>
              {(control) => (
                <Select {...control} value={state.locationId} onChange={(event) => set("locationId", event.target.value)}>
                  <option value="">{t("assets.form.none")}</option>
                  {locationRows
                    .filter((row) => row.location.archivedAt === null || row.location.id === state.locationId)
                    .map((row) => (
                      <option key={row.location.id} value={row.location.id}>
                        {row.path}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            ) : null}
          </div>
          <Field label={t("assets.fields.service")} hint={t("assets.form.serviceHint")}>
            {(control) => (
              <Select {...control} value={state.serviceId} onChange={(event) => set("serviceId", event.target.value)}>
                <option value="">{t("assets.form.none")}</option>
                {options.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <h3 className={sectionTitleClassName}>{t("assets.form.purchaseSection")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("assets.fields.purchaseDate")}>
              {(control) => <Input {...control} type="date" value={state.purchaseDate} onChange={(event) => set("purchaseDate", event.target.value)} />}
            </Field>
            <Field label={t("assets.fields.warrantyEndsAt")}>
              {(control) => <Input {...control} type="date" value={state.warrantyEndsAt} onChange={(event) => set("warrantyEndsAt", event.target.value)} />}
            </Field>
            <Field label={t("assets.fields.purchaseCost")}>
              {(control) => (
                <Input {...control} inputMode="decimal" value={state.purchaseCost} onChange={(event) => set("purchaseCost", event.target.value)} />
              )}
            </Field>
            <Field label={t("assets.fields.supplier")}>
              {(control) => <Input {...control} value={state.supplier} maxLength={160} onChange={(event) => set("supplier", event.target.value)} />}
            </Field>
          </div>

          {attributes.length > 0 ? (
            <>
              <h3 className={sectionTitleClassName}>{t("assets.form.attributesSection")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {attributes.map((attribute) => {
                  const label = localizedLabel(attribute, i18n.language);
                  const value = state.attributes[attribute.key];
                  if (attribute.dataType === "BOOLEAN") {
                    return (
                      <Checkbox
                        key={attribute.id}
                        label={label}
                        checked={value === true}
                        onChange={(event) => setAttribute(attribute.key, event.target.checked)}
                      />
                    );
                  }
                  return (
                    <Field key={attribute.id} label={label} required={attribute.isRequired}>
                      {(control) =>
                        attribute.dataType === "SELECT" ? (
                          <Select {...control} value={typeof value === "string" ? value : ""} onChange={(event) => setAttribute(attribute.key, event.target.value)}>
                            <option value="">{t("assets.form.none")}</option>
                            {attribute.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Input
                            {...control}
                            type={attribute.dataType === "DATE" ? "date" : "text"}
                            inputMode={attribute.dataType === "NUMBER" ? "decimal" : undefined}
                            maxLength={500}
                            value={typeof value === "string" ? value : ""}
                            onChange={(event) => setAttribute(attribute.key, event.target.value)}
                          />
                        )
                      }
                    </Field>
                  );
                })}
              </div>
            </>
          ) : null}

          <Field label={t("assets.fields.notes")}>
            {(control) => <Textarea {...control} rows={3} maxLength={4000} value={state.notes} onChange={(event) => set("notes", event.target.value)} />}
          </Field>
          {options.units.length === 0 ? <p className={hintClassName}>{t("assets.form.noUnits")}</p> : null}
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("ui.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={pending || state.name.trim().length === 0 || state.typeId === "" || state.organizationalUnitId === ""}>
              {pending ? t("ui.loading") : t("assets.form.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
