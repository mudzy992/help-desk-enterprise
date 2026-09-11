import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { controlClassName, errorTextClassName, labelClassName } from "@/components/ui/control";
import { slaPriorities } from "@/lib/sla/sla-form-defaults";

const priorityLabelKeys = {
  CRITICAL: "sla.priorityCritical",
  HIGH: "sla.priorityHigh",
  MEDIUM: "sla.priorityMedium",
  LOW: "sla.priorityLow",
} as const;
import type { RuleWriteInput, SlaRule } from "@/services/sla-api";

interface SlaRuleFormProperties {
  readonly rule?: SlaRule;
  readonly errorKey: string | null;
  readonly isSubmitting: boolean;
  readonly onSubmit: (input: RuleWriteInput) => Promise<void>;
}

export function SlaRuleForm({
  rule,
  errorKey,
  isSubmitting,
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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
        <select className={controlClassName} value={priority} onChange={(event) => setPriority(event.target.value)}>
          {slaPriorities.map((item) => (
            <option key={item} value={item}>
              {t(priorityLabelKeys[item])}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClassName}>
        {t("sla.responseMinutes")}
        <input className={controlClassName} type="number" min={1} value={responseMinutes} onChange={(event) => setResponseMinutes(event.target.value)} required />
      </label>
      <label className={labelClassName}>
        {t("sla.resolutionMinutes")}
        <input className={controlClassName} type="number" min={1} value={resolutionMinutes} onChange={(event) => setResolutionMinutes(event.target.value)} required />
      </label>
      <label className={labelClassName}>
        {t("sla.evaluationOrder")}
        <input className={controlClassName} type="number" min={0} value={evaluationOrder} onChange={(event) => setEvaluationOrder(event.target.value)} required />
      </label>
      <label className={labelClassName}>
        {t("sla.serviceId")}
        <input className={controlClassName} value={serviceId} onChange={(event) => setServiceId(event.target.value)} />
      </label>
      <label className={labelClassName}>
        {t("sla.organizationalUnitId")}
        <input className={controlClassName} value={organizationalUnitId} onChange={(event) => setOrganizationalUnitId(event.target.value)} />
      </label>
      <label className={labelClassName}>
        {t("sla.reason")}
        <input className={controlClassName} value={reason} onChange={(event) => setReason(event.target.value)} required />
      </label>
      {errorKey ? <p className={errorTextClassName}>{t(errorKey as never)}</p> : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("sla.saving") : rule ? t("sla.saveRule") : t("sla.createRule")}
        </Button>
      </div>
    </form>
  );
}
