import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { ServiceCategoryResponse } from "@/services/service-categories-api";
import type { ServiceResponse } from "@/services/service-catalog-api";

export type OnboardingServiceValues = {
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly requiresApproval: boolean;
};

interface OnboardingServiceStepProperties {
  readonly service: ServiceResponse | null;
  readonly categories: readonly ServiceCategoryResponse[];
  readonly isSaving: boolean;
  readonly onSubmit: (values: OnboardingServiceValues) => void;
}

export function OnboardingServiceStep({
  service,
  categories,
  isSaving,
  onSubmit,
}: OnboardingServiceStepProperties) {
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
  const canSubmit =
    name.trim().length > 0 && categoryId.length > 0 && (!isCreate || slug.trim().length > 0);

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
    <form className="fade-in grid max-w-xl gap-3" onSubmit={submit}>
      <Field label={t("services.name")} required>
        <Input value={name} maxLength={128} required onChange={(event) => setName(event.target.value)} />
      </Field>
      {isCreate ? (
        <Field label={t("services.slug")} required>
          <Input value={slug} maxLength={64} required onChange={(event) => setSlug(event.target.value)} />
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
        <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} />
      </Field>
      <Button type="submit" size="sm" disabled={isSaving || !canSubmit}>
        {isSaving ? t("services.onboarding.saving") : t("services.onboarding.next")}
      </Button>
    </form>
  );
}
