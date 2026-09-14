import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Input } from "@/components/ui/field";
import { createRoutingRule } from "@/services/routing-api";
import { ApiError } from "@/services/api";

interface CreateRoutingRuleFormProperties {
  readonly onCreated: () => Promise<void>;
}

export function CreateRoutingRuleForm({
  onCreated,
}: CreateRoutingRuleFormProperties) {
  const { t } = useTranslation();
  const [originUnitId, setOriginUnitId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [errorKey, setErrorKey] = useState<
    | "routing.errorUnauthorized"
    | "routing.errorDuplicate"
    | "routing.errorForbidden"
    | "routing.errorGeneric"
    | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await createRoutingRule({ originUnitId, serviceId, groupId });
      setOriginUnitId("");
      setServiceId("");
      setGroupId("");
      await onCreated();
    } catch (error) {
      setErrorKey(mapCreateError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="grid max-w-xl gap-3" onSubmit={onSubmit}>
      <Field label={t("routing.originUnitId")} required>
        <Input
          value={originUnitId}
          onChange={(event) => setOriginUnitId(event.target.value)}
          required
        />
      </Field>
      <Field label={t("routing.serviceId")} required>
        <Input
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
          required
        />
      </Field>
      <Field label={t("routing.groupId")} required>
        <Input
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          required
        />
      </Field>
      {errorKey ? (
        <p className={errorTextClassName}>{t(errorKey)}</p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("routing.saving") : t("routing.createRule")}
        </Button>
      </div>
    </form>
  );
}

function mapCreateError(
  error: unknown,
):
  | "routing.errorUnauthorized"
  | "routing.errorDuplicate"
  | "routing.errorForbidden"
  | "routing.errorGeneric" {
  if (error instanceof ApiError && error.status === 401) {
    return "routing.errorUnauthorized";
  }
  if (error instanceof ApiError && error.code === "DUPLICATE_RULE") {
    return "routing.errorDuplicate";
  }
  if (error instanceof ApiError && error.code === "FORBIDDEN") {
    return "routing.errorForbidden";
  }
  return "routing.errorGeneric";
}
