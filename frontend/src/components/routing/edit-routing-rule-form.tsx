import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Select, Textarea } from "@/components/ui/field";
import { mapRoutingError, type RoutingErrorKey } from "@/lib/routing/map-routing-error";
import {
  updateRoutingRule,
  type RoutingHandlerGroup,
  type RoutingRuleResponse,
} from "@/services/routing-api";

interface EditRoutingRuleFormProperties {
  readonly rule: RoutingRuleResponse;
  readonly groups: readonly RoutingHandlerGroup[];
  readonly onUpdated: () => Promise<void>;
  readonly onCancel: () => void;
}

const maximumChangeReasonLength = 512;

export function EditRoutingRuleForm({
  rule,
  groups,
  onUpdated,
  onCancel,
}: EditRoutingRuleFormProperties) {
  const { t } = useTranslation();
  const [groupId, setGroupId] = useState(rule.groupId);
  const [reason, setReason] = useState("");
  const [errorKey, setErrorKey] = useState<RoutingErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await updateRoutingRule(rule.id, {
        originUnitId: rule.originUnitId,
        serviceId: rule.serviceId,
        groupId,
        reason: reason.trim(),
      });
      await onUpdated();
    } catch (error) {
      setErrorKey(mapRoutingError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="grid gap-3.5" onSubmit={onSubmit}>
      <Field label={t("routing.originUnitId")}>
        <Select value={rule.originUnitId} disabled>
          <option value={rule.originUnitId}>{rule.originUnitPath}</option>
        </Select>
      </Field>
      <Field label={t("routing.serviceId")}>
        <Select value={rule.serviceId} disabled>
          <option value={rule.serviceId}>{rule.serviceName}</option>
        </Select>
      </Field>
      <Field label={t("routing.groupId")} required>
        <Select
          value={groupId}
          required
          onChange={(event) => setGroupId(event.target.value)}
        >
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("routing.reason")} required hint={t("routing.reasonHint")}>
        <Textarea
          value={reason}
          required
          maxLength={maximumChangeReasonLength}
          className="min-h-16"
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? t("routing.saving") : t("routing.saveEdit")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("routing.cancel")}
        </Button>
      </div>
    </form>
  );
}
