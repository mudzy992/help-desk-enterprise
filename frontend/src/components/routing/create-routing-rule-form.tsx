import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Select, Textarea } from "@/components/ui/field";
import { mapRoutingError, type RoutingErrorKey } from "@/lib/routing/map-routing-error";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import {
  createRoutingRule,
  type RoutingHandlerGroup,
  type RoutingRuleResponse,
} from "@/services/routing-api";
import type { ServiceResponse } from "@/services/service-catalog-api";

interface CreateRoutingRuleFormProperties {
  readonly originUnits: readonly OriginUnitOption[];
  readonly services: readonly ServiceResponse[];
  readonly groups: readonly RoutingHandlerGroup[];
  readonly existingRules: readonly RoutingRuleResponse[];
  readonly onCreated: () => Promise<void>;
}

const maximumChangeReasonLength = 512;

export function CreateRoutingRuleForm({
  originUnits,
  services,
  groups,
  existingRules,
  onCreated,
}: CreateRoutingRuleFormProperties) {
  const { t } = useTranslation();
  const [originUnitId, setOriginUnitId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [reason, setReason] = useState("");
  const [errorKey, setErrorKey] = useState<RoutingErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const duplicateRule = existingRules.find(
    (rule) => rule.originUnitId === originUnitId && rule.serviceId === serviceId,
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await createRoutingRule({
        originUnitId,
        serviceId,
        groupId,
        reason: reason.trim(),
      });
      setOriginUnitId("");
      setServiceId("");
      setGroupId("");
      setReason("");
      await onCreated();
    } catch (error) {
      setErrorKey(mapRoutingError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="grid gap-3.5" onSubmit={onSubmit}>
      <Field label={t("routing.originUnitId")} required>
        <Select
          value={originUnitId}
          required
          onChange={(event) => setOriginUnitId(event.target.value)}
        >
          <option value="">{t("routing.selectPlaceholder")}</option>
          {originUnits.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("routing.serviceId")} required>
        <Select
          value={serviceId}
          required
          onChange={(event) => setServiceId(event.target.value)}
        >
          <option value="">{t("routing.selectPlaceholder")}</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("routing.groupId")} required>
        <Select
          value={groupId}
          required
          onChange={(event) => setGroupId(event.target.value)}
        >
          <option value="">{t("routing.selectPlaceholder")}</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </Select>
      </Field>
      {duplicateRule ? (
        <p className="rounded-lg border border-warning/30 bg-warning/6 px-3 py-2 text-[11.5px] leading-[15px] text-foreground/85">
          {t("routing.duplicateWarning")}
        </p>
      ) : null}
      <Field
        label={t("routing.reason")}
        required
        hint={t("routing.reasonHint")}
      >
        <Textarea
          value={reason}
          required
          maxLength={maximumChangeReasonLength}
          className="min-h-16"
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {errorKey ? (
        <p className={errorTextClassName}>{t(errorKey)}</p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? t("routing.saving") : t("routing.createRule")}
      </Button>
    </form>
  );
}
