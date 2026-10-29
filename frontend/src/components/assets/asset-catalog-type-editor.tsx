import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { errorTextClassName, hintClassName } from "@/components/ui/control";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  assetCategories,
  createAssetType,
  updateAssetType,
  type AssetCategory,
  type AssetType,
} from "@/services/assets-api";
import { EditorFooter, useAssetCatalogErrorText } from "./asset-catalog-editor-shared";

const typeKeyPattern = /^[a-z][a-z0-9-]{1,47}$/;

export function AssetCatalogTypeEditor({
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
  const errorText = useAssetCatalogErrorText();
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
    const input = {
      nameBs: nameBs.trim(),
      nameEn: nameEn.trim(),
      icon,
      category,
      isUserSelectable,
      routingGroupId: routingGroupId || null,
      sortOrder: Number.parseInt(sortOrder, 10) || 0,
    };
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
        <SheetTitle>
          {type === null ? t("assets.catalog.addType") : t("assets.catalog.editTypeTitle")}
        </SheetTitle>
        <SheetDescription className="mt-1 text-[12px] text-muted-foreground">
          {t("assets.catalog.typeDescription")}
        </SheetDescription>
        <form className="mt-4 grid gap-3" onSubmit={(event) => void submit(event)} noValidate>
          <Field
            label={t("assets.catalog.key")}
            required
            hint={t("assets.catalog.keyHint")}
            error={key.length > 0 && keyInvalid ? t("assets.catalog.keyInvalid") : null}
          >
            {(control) => (
              <Input
                {...control}
                value={key}
                maxLength={48}
                disabled={type !== null}
                onChange={(event) => setKey(event.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("assets.catalog.nameBs")} required>
              {(control) => (
                <Input
                  {...control}
                  value={nameBs}
                  maxLength={80}
                  onChange={(event) => setNameBs(event.target.value)}
                />
              )}
            </Field>
            <Field label={t("assets.catalog.nameEn")} required>
              {(control) => (
                <Input
                  {...control}
                  value={nameEn}
                  maxLength={80}
                  onChange={(event) => setNameEn(event.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("assets.catalog.category")}>
              {(control) => (
                <Select
                  {...control}
                  value={category}
                  onChange={(event) => setCategory(event.target.value as AssetCategory)}
                >
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
            label={t("assets.catalog.userSelectableLabel")}
            checked={isUserSelectable}
            onChange={(event) => setIsUserSelectable(event.target.checked)}
          />
          <p className={hintClassName}>{t("assets.catalog.userSelectableHint")}</p>
          <Field
            label={t("assets.catalog.routingGroup")}
            hint={t("assets.catalog.routingGroupHint")}
          >
            {(control) => (
              <Select
                {...control}
                value={routingGroupId}
                onChange={(event) => setRoutingGroupId(event.target.value)}
              >
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
          <EditorFooter
            pending={pending}
            disabled={keyInvalid || nameBs.trim() === "" || nameEn.trim() === ""}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </SheetContent>
    </Sheet>
  );
}
