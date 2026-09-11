import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
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
    <form className="mt-3 grid max-w-xl gap-3" onSubmit={onSubmit}>
      <label className="grid gap-1 text-body">
        {t("routing.originUnitId")}
        <input
          className="h-9 border border-input bg-surface px-2"
          value={originUnitId}
          onChange={(event) => setOriginUnitId(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-1 text-body">
        {t("routing.serviceId")}
        <input
          className="h-9 border border-input bg-surface px-2"
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
          required
        />
      </label>
      <label className="grid gap-1 text-body">
        {t("routing.groupId")}
        <input
          className="h-9 border border-input bg-surface px-2"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          required
        />
      </label>
      {errorKey ? (
        <p className="text-body text-destructive">{t(errorKey)}</p>
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
