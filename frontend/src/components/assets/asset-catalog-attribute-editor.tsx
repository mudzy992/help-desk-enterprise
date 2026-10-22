import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { localizedName } from "@/lib/assets/asset-view";
import {
  assetAttributeDataTypes,
  createAssetAttribute,
  updateAssetAttribute,
  type AssetAttribute,
  type AssetAttributeDataType,
  type AssetType,
} from "@/services/assets-api";
import { EditorFooter, useAssetCatalogErrorText } from "./asset-catalog-editor-shared";

const attributeKeyPattern = /^[a-z][A-Za-z0-9]{0,47}$/;

export function AssetCatalogAttributeEditor({
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
  const errorText = useAssetCatalogErrorText();
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
        <SheetTitle>
          {attribute === null
            ? t("assets.catalog.addAttribute")
            : t("assets.catalog.editAttributeTitle")}
        </SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("assets.catalog.attributeDescription", { type: localizedName(type, i18n.language) })}
        </SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field
            label={t("assets.catalog.key")}
            required
            hint={t("assets.catalog.attributeKeyHint")}
            error={key.length > 0 && keyInvalid ? t("assets.catalog.keyInvalid") : null}
          >
            {(control) => (
              <Input
                {...control}
                value={key}
                maxLength={48}
                disabled={attribute !== null}
                onChange={(event) => setKey(event.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("assets.catalog.labelBs")} required>
              {(control) => (
                <Input
                  {...control}
                  value={labelBs}
                  maxLength={80}
                  onChange={(event) => setLabelBs(event.target.value)}
                />
              )}
            </Field>
            <Field label={t("assets.catalog.labelEn")} required>
              {(control) => (
                <Input
                  {...control}
                  value={labelEn}
                  maxLength={80}
                  onChange={(event) => setLabelEn(event.target.value)}
                />
              )}
            </Field>
          </div>
          <Field
            label={t("assets.catalog.dataType")}
            hint={attribute !== null ? t("assets.catalog.dataTypeHint") : undefined}
          >
            {(control) => (
              <Select
                {...control}
                value={dataType}
                onChange={(event) => setDataType(event.target.value as AssetAttributeDataType)}
              >
                {assetAttributeDataTypes.map((value) => (
                  <option key={value} value={value}>
                    {t(`assets.dataTypes.${value}` as const)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {dataType === "SELECT" ? (
            <Field
              label={t("assets.catalog.options")}
              required
              hint={t("assets.catalog.optionsHint")}
            >
              {(control) => (
                <Textarea
                  {...control}
                  rows={4}
                  value={options}
                  onChange={(event) => setOptions(event.target.value)}
                />
              )}
            </Field>
          ) : null}
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
          <Checkbox
            label={t("assets.catalog.requiredLabel")}
            checked={isRequired}
            onChange={(event) => setIsRequired(event.target.checked)}
          />
          <Checkbox
            label={t("assets.catalog.uniqueLabel")}
            checked={isUnique}
            onChange={(event) => setIsUnique(event.target.checked)}
          />
          {error ? (
            <p role="alert" className={errorTextClassName}>
              {error}
            </p>
          ) : null}
          <EditorFooter
            pending={pending}
            disabled={
              keyInvalid ||
              labelBs.trim() === "" ||
              labelEn.trim() === "" ||
              (dataType === "SELECT" && optionList.length === 0)
            }
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
