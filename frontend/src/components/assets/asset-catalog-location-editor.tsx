import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  assetLocationDepthMax,
  flattenLocationTree,
  locationHeight,
  locationSubtree,
} from "@/lib/assets/asset-view";
import {
  createAssetLocation,
  updateAssetLocation,
  type AssetCatalog,
  type AssetLocation,
} from "@/services/assets-api";
import { EditorFooter, useAssetCatalogErrorText } from "./asset-catalog-editor-shared";

export function AssetCatalogLocationEditor({
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
  const errorText = useAssetCatalogErrorText();
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

  // requirement: any location may be a parent, except the location itself, its own
  // sub-locations (no cycles) and parents that would exceed the depth limit.
  const rows = flattenLocationTree(catalog.locations);
  const excluded =
    location === null ? new Set<string>() : locationSubtree(catalog.locations, location.id);
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
    const input = {
      parentId: parentId || null,
      name: name.trim(),
      code: code.trim() || null,
      sortOrder: Number.parseInt(sortOrder, 10) || 0,
    };
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
        <SheetTitle>
          {location === null
            ? t("assets.catalog.addLocation")
            : t("assets.catalog.editLocationTitle")}
        </SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("assets.catalog.locationDescription")}
        </SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field
            label={t("assets.catalog.parentLocation")}
            hint={t("assets.catalog.parentHint", { max: assetLocationDepthMax })}
          >
            {(control) => (
              <Select
                {...control}
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
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
            {(control) => (
              <Input
                {...control}
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={t("assets.catalog.locationCode")}
              hint={t("assets.catalog.locationCodeHint")}
            >
              {(control) => (
                <Input
                  {...control}
                  value={code}
                  maxLength={32}
                  onChange={(event) => setCode(event.target.value)}
                />
              )}
            </Field>
            <Field label={t("assets.catalog.sortOrder")}>
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value.replace(/\D/g, ""))}
                />
              )}
            </Field>
          </div>
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <EditorFooter
            pending={pending}
            disabled={name.trim() === ""}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
