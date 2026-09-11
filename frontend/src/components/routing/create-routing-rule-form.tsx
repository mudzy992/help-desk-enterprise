import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, errorTextClassName, labelClassName } from "@/components/ui/control";
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
      <label className={labelClassName}>
        {t("routing.originUnitId")}
        <input
          className={controlClassName}
          value={originUnitId}
          onChange={(event) => setOriginUnitId(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("routing.serviceId")}
        <input
          className={controlClassName}
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("routing.groupId")}
        <input
          className={controlClassName}
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          required
        />
      </label>
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
