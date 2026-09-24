import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input, Select } from "@/components/ui/field";
import type { ServiceCategoryErrorKey } from "@/lib/services/map-service-category-error";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";

export type ServiceCategoryMutationValues = {
  readonly name: string;
  readonly slug: string;
  readonly sortOrder: number;
  readonly parentId: string | null;
};

interface ServiceCategoryMutationFormProperties {
  readonly category: ServiceCategoryResponse | null;
  readonly categories: readonly ServiceCategoryResponse[];
  readonly isSaving: boolean;
  readonly errorKey: ServiceCategoryErrorKey | null;
  readonly onCancel: () => void;
  readonly onSubmit: (values: ServiceCategoryMutationValues) => void;
}

export function ServiceCategoryMutationForm({
  category,
  categories,
  isSaving,
  errorKey,
  onCancel,
  onSubmit,
}: ServiceCategoryMutationFormProperties) {
  const { t } = useTranslation();
  const isCreate = category === null;
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [parentId, setParentId] = useState(category?.parentId ?? "");
  const parentOptions = categories.filter((item) => item.id !== category?.id);
  const canSubmit = name.trim().length > 0 && (!isCreate || slug.trim().length > 0);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit({
      name: name.trim(),
      slug: slug.trim(),
      sortOrder: Number.parseInt(sortOrder, 10) || 0,
      parentId: parentId.length > 0 ? parentId : null,
    });
  };

  return (
    <form className="fade-in mt-4 grid gap-3" onSubmit={submit}>
      <Field label={t("services.name")} required>
        <Input value={name} maxLength={128} required onChange={(event) => setName(event.target.value)} />
      </Field>
      {isCreate ? (
        <Field label={t("services.slug")} required hint={t("services.categories.slugHint")}>
          <Input value={slug} maxLength={64} required onChange={(event) => setSlug(event.target.value)} />
        </Field>
      ) : null}
      <Field label={t("services.categories.sortOrder")}>
        <Input
          type="number"
          min={0}
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
        />
      </Field>
      <Field label={t("services.categories.parent")}>
        <Select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">{t("services.categories.parentNone")}</option>
          {parentOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
      {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSaving || !canSubmit}>
          {isSaving
            ? t(isCreate ? "services.categories.creating" : "services.categories.saving")
            : t(isCreate ? "services.categories.create" : "services.categories.save")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {t("services.cancel")}
        </Button>
      </div>
    </form>
  );
}
