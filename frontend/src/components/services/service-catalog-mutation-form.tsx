import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { requireCatalogChangeReason } from "@/lib/services/require-catalog-change-reason";
import { formatSlaProfileName } from "@/lib/sla/sla-profile-name";
import type { PersistedPolicyPackOption } from "@/services/policy-packs-api";
import { listSlaProfiles, type SlaProfile } from "@/services/sla-api";
import type {
  AutoAssignStrategy,
  CreateServiceInput,
  DataClassification,
  ServiceCategoryResponse,
  ServiceResponse,
  UpdateServiceInput,
} from "@/services/service-catalog-api";

const classificationOptions: readonly DataClassification[] = ["INTERNAL", "CONFIDENTIAL", "RESTRICTED"];
const classificationLabelKey = {
  INTERNAL: "services.classificationOptions.INTERNAL",
  CONFIDENTIAL: "services.classificationOptions.CONFIDENTIAL",
  RESTRICTED: "services.classificationOptions.RESTRICTED",
} as const;
const autoAssignOptions: readonly AutoAssignStrategy[] = ["NONE", "LEAST_BUSY", "ROUND_ROBIN"];
const autoAssignLabelKey = {
  NONE: "services.autoAssignOptions.NONE",
  LEAST_BUSY: "services.autoAssignOptions.LEAST_BUSY",
  ROUND_ROBIN: "services.autoAssignOptions.ROUND_ROBIN",
} as const;

function label(t: unknown, key: string): string {
  return (t as (key: string) => string)(key);
}

export type ServiceCatalogMutationValues = {
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly classification: DataClassification;
  readonly requiresApproval: boolean;
  readonly isConfidentialDefault: boolean;
  readonly autoAssignStrategy: AutoAssignStrategy;
  readonly policyPackId: string | null;
  readonly slaProfileId: string | null;
  readonly reason: string;
};

interface ServiceCatalogMutationFormProperties {
  readonly service: ServiceResponse | null;
  readonly categories: readonly ServiceCategoryResponse[];
  readonly policyPacks: readonly PersistedPolicyPackOption[];
  readonly isSaving: boolean;
  readonly errorKey: string | null;
  readonly onCancel: () => void;
  readonly onSubmit: (values: CreateServiceInput | UpdateServiceInput) => void;
}

export function ServiceCatalogMutationForm({
  service,
  categories,
  policyPacks,
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
  const [classification, setClassification] = useState<DataClassification>(
    service?.classification ?? "INTERNAL",
  );
  const [requiresApproval, setRequiresApproval] = useState(
    service?.requiresApproval ?? false,
  );
  const [isConfidentialDefault, setIsConfidentialDefault] = useState(
    service?.isConfidentialDefault ?? false,
  );
  const [autoAssignStrategy, setAutoAssignStrategy] = useState<AutoAssignStrategy>(
    service?.autoAssignStrategy ?? "NONE",
  );
  const [policyPackId, setPolicyPackId] = useState<string | null>(
    service?.policyPackId ?? null,
  );
  const [slaProfiles, setSlaProfiles] = useState<readonly SlaProfile[]>([]);
  const [slaProfileId, setSlaProfileId] = useState<string | null>(
    service?.slaProfileId ?? null,
  );
  const [reason, setReason] = useState("");
  const canSubmit =
    requireCatalogChangeReason(reason) !== null && categoryId.length > 0;

  useEffect(() => {
    let cancelled = false;
    void listSlaProfiles()
      .then((rows) => {
        if (!cancelled) {
          setSlaProfiles(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSlaProfiles([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    const trimmedReason = reason.trim();
    if (isCreate) {
      onSubmit({
        name: name.trim(),
        slug: slug.trim(),
        categoryId,
        classification,
        requiresApproval,
        isConfidentialDefault,
        autoAssignStrategy,
        policyPackId,
        slaProfileId,
        reason: trimmedReason,
      } satisfies CreateServiceInput);
      return;
    }
    onSubmit({
      name: name.trim(),
      categoryId,
      classification,
      requiresApproval,
      isConfidentialDefault,
      autoAssignStrategy,
      policyPackId,
      slaProfileId,
      reason: trimmedReason,
    } satisfies UpdateServiceInput);
  };

  return (
    <form className="fade-in mt-4 grid gap-3" onSubmit={submit}>
      <Field label={label(t, "services.name")} required>
        <Input
          value={name}
          maxLength={128}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      {isCreate ? (
        <Field label={label(t, "services.slug")} required>
          <Input
            value={slug}
            maxLength={64}
            required
            onChange={(event) => setSlug(event.target.value)}
          />
        </Field>
      ) : null}
      <Field label={label(t, "services.category")} required>
        <Select
          value={categoryId}
          required
          disabled={categories.length === 0}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          {categories.length === 0 ? (
            <option value="">{label(t, "services.categoryEmpty")}</option>
          ) : (
            categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))
          )}
        </Select>
      </Field>
      <Field label={label(t, "services.classification")}>
        <Select
          value={classification}
          onChange={(event) => setClassification(event.target.value as DataClassification)}
        >
          {classificationOptions.map((option) => (
            <option key={option} value={option}>
              {t(classificationLabelKey[option])}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("services.requiresApproval")}>
        <Switch
          checked={requiresApproval}
          onCheckedChange={setRequiresApproval}
        />
      </Field>
      <Field label={label(t, "services.isConfidentialDefault")}>
        <Switch
          checked={isConfidentialDefault}
          onCheckedChange={setIsConfidentialDefault}
        />
      </Field>
      <Field label={label(t, "services.autoAssignStrategy")}>
        <Select
          value={autoAssignStrategy}
          onChange={(event) => setAutoAssignStrategy(event.target.value as AutoAssignStrategy)}
        >
          {autoAssignOptions.map((option) => (
            <option key={option} value={option}>
              {t(autoAssignLabelKey[option])}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={label(t, "services.policyPack")}>
        <Select
          value={policyPackId ?? ""}
          onChange={(event) => setPolicyPackId(event.target.value || null)}
        >
          <option value="">—</option>
          {policyPacks
            .filter((pack) => !pack.isDisabled)
            .map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label={label(t, "services.slaProfile")}>
        <Select
          value={slaProfileId ?? ""}
          onChange={(event) => setSlaProfileId(event.target.value || null)}
        >
          <option value="">—</option>
          {slaProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {formatSlaProfileName(profile.key, profile.name, t as never)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={label(t, "services.changeReason")}
        required
        hint={label(t, "services.changeReasonHint")}
      >
        <Textarea
          value={reason}
          maxLength={512}
          required
          className="min-h-16"
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {errorKey ? <p className={errorTextClassName}>{label(t, errorKey)}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSaving || !canSubmit}>
          {isSaving
            ? label(t, isCreate ? "services.creatingService" : "services.savingService")
            : label(t, isCreate ? "services.createService" : "services.saveService")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          {label(t, "services.cancel")}
        </Button>
      </div>
    </form>
  );
}
