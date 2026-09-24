import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { ServiceCatalogErrorKey } from "@/lib/services/map-service-catalog-error";
import { requireCatalogChangeReason } from "@/lib/services/require-catalog-change-reason";
import type {
  ServiceCategoryResponse,
  ServiceResponse,
} from "@/services/service-catalog-api";

export type ServiceCatalogMutationValues = {
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly requiresApproval: boolean;
};

interface ServiceCatalogMutationFormProperties {
  readonly service: ServiceResponse | null;
  readonly categories: readonly ServiceCategoryResponse[];
  readonly isSaving: boolean;
  readonly errorKey: ServiceCatalogErrorKey | null;
  readonly onCancel: () => void;
  readonly onSubmit: (values: ServiceCatalogMutationValues) => void;
}

export function ServiceCatalogMutationForm({
  service,
  categories,
  isSaving,
  errorKey,
  onCancel,
  onSubmit,
}: ServiceCatalogMutationFormProperties) {
  const { t } = useTranslation();
  const isCreate = service === null;
  const [name, setName] = useState(service?.name ?? "");
  const [slug, setSlug] = useState(service?.slug ?? "");
  const [categoryId, setCategoryId] = useState(
    service?.categoryId ?? categories[0]?.id ?? "",
  );
  const [requiresApproval, setRequiresApproval] = useState(
    service?.requiresApproval ?? false,
  );
  const [reason, setReason] = useState("");
  const canSubmit =
    requireCatalogChangeReason(reason) !== null && categoryId.length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit({
      name: name.trim(),
      slug: slug.trim(),
      categoryId,
      requiresApproval,
    });
  };

  return (
    <form className="fade-in mt-4 grid gap-3" onSubmit={submit}>
      <Field label={t("services.name")} required>
        <Input
          value={name}
          maxLength={128}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      {isCreate ? (
        <Field label={t("services.slug")} required>
          <Input
            value={slug}
            maxLength={64}
            required
            onChange={(event) => setSlug(event.target.value)}
          />
        </Field>
      ) : null}
      <Field label={t("services.category")} required>
        <Select
          value={categoryId}
          required
          disabled={categories.length === 0}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          {categories.length === 0 ? (
            <option value="">{t("services.categoryEmpty")}</option>
          ) : (
            categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))
          )}
        </Select>
      </Field>
      <Field label={t("services.requiresApproval")}>
        <Switch
          checked={requiresApproval}
          onCheckedChange={setRequiresApproval}
        />
      </Field>
      <Field
        label={t("services.changeReason")}
        required
        hint={t("services.changeReasonHint")}
      >
        <Textarea
          value={reason}
          maxLength={512}
          required
          className="min-h-16"
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSaving || !canSubmit}>
          {isSaving
            ? t(isCreate ? "services.creatingService" : "services.savingService")
            : t(isCreate ? "services.createService" : "services.saveService")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {t("services.cancel")}
        </Button>
      </div>
    </form>
  );
}
