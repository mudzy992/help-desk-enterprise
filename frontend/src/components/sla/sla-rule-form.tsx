import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, errorTextClassName, labelClassName } from "@/components/ui/control";
import {
  slaPriorities,
  slaPriorityLabelKey,
} from "@/lib/sla/sla-form-defaults";
import { flattenOriginUnitOptions } from "@/lib/tickets/ticket-display";
import {
  listOrganizationalUnitTree,
  type OrganizationalUnitTreeNode,
} from "@/services/organizational-units-api";
import { listServices, type ServiceResponse } from "@/services/service-catalog-api";
import type { RuleWriteInput, SlaRule } from "@/services/sla-api";

interface SlaRuleFormProperties {
  readonly rule?: SlaRule;
  readonly errorKey: string | null;
  readonly isSubmitting: boolean;
  readonly requireMatch?: boolean;
  readonly onSubmit: (input: RuleWriteInput) => Promise<void>;
}

export function SlaRuleForm({
  rule,
  errorKey,
  isSubmitting,
  requireMatch = false,
  onSubmit,
}: SlaRuleFormProperties) {
  const { t } = useTranslation();
  const [priority, setPriority] = useState(rule?.priority ?? "MEDIUM");
  const [responseMinutes, setResponseMinutes] = useState(String(rule?.responseMinutes ?? 60));
  const [resolutionMinutes, setResolutionMinutes] = useState(String(rule?.resolutionMinutes ?? 480));
  const [evaluationOrder, setEvaluationOrder] = useState(String(rule?.evaluationOrder ?? 100));
  const [organizationalUnitId, setOrganizationalUnitId] = useState(rule?.organizationalUnitId ?? "");
  const [serviceId, setServiceId] = useState(rule?.serviceId ?? "");
  const [reason, setReason] = useState("");
  const [services, setServices] = useState<readonly ServiceResponse[]>([]);
  const [units, setUnits] = useState<readonly OrganizationalUnitTreeNode[]>([]);
  const [matchError, setMatchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listServices(), listOrganizationalUnitTree()]).then(
      ([nextServices, nextUnits]) => {
        if (cancelled) return;
        setServices(nextServices);
        setUnits(nextUnits);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const unitOptions = flattenOriginUnitOptions(units);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requireMatch && serviceId.length === 0 && organizationalUnitId.length === 0) {
      setMatchError(true);
      return;
    }
    setMatchError(false);
    await onSubmit({
      priority,
      responseMinutes: Number(responseMinutes),
      resolutionMinutes: Number(resolutionMinutes),
      evaluationOrder: Number(evaluationOrder),
      organizationalUnitId,
      serviceId,
      reason,
    });
    setReason("");
  };

  return (
    <form className="grid max-w-xl gap-3" onSubmit={submit}>
      <label className={labelClassName}>
        {t("sla.priority")}
        <select
          className={controlClassName}
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          {slaPriorities.map((item) => (
            <option key={item} value={item}>
              {t(slaPriorityLabelKey(item))}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClassName}>
        {t("sla.responseMinutes")}
        <input
          className={controlClassName}
          type="number"
          min={1}
          value={responseMinutes}
          onChange={(event) => setResponseMinutes(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("sla.resolutionMinutes")}
        <input
          className={controlClassName}
          type="number"
          min={1}
          value={resolutionMinutes}
          onChange={(event) => setResolutionMinutes(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("sla.evaluationOrder")}
        <input
          className={controlClassName}
          type="number"
          min={0}
          value={evaluationOrder}
          onChange={(event) => setEvaluationOrder(event.target.value)}
          required
        />
      </label>
      <label className={labelClassName}>
        {t("sla.serviceId")}
        <select
          className={controlClassName}
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
        >
          <option value="">{t("sla.selectNone")}</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClassName}>
        {t("sla.organizationalUnitId")}
        <select
          className={controlClassName}
          value={organizationalUnitId}
          onChange={(event) => setOrganizationalUnitId(event.target.value)}
        >
          <option value="">{t("sla.selectNone")}</option>
          {unitOptions.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClassName}>
        {t("sla.reason")}
        <input
          className={controlClassName}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        />
      </label>
      {matchError ? (
        <p className={errorTextClassName}>{t("sla.overrideMatchRequired")}</p>
      ) : null}
      {errorKey ? <p className={errorTextClassName}>{t(errorKey as never)}</p> : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("sla.saving") : rule ? t("sla.saveRule") : t("sla.createRule")}
        </Button>
      </div>
    </form>
  );
}
