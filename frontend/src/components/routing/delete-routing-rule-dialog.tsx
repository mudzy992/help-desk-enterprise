import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { errorTextClassName } from "@/components/ui/control";
import { Field, Textarea } from "@/components/ui/field";
import { mapRoutingError, type RoutingErrorKey } from "@/lib/routing/map-routing-error";
import {
  deleteRoutingRule,
  getRoutingRuleDeleteImpact,
  type RoutingRuleDeleteImpact,
  type RoutingRuleResponse,
} from "@/services/routing-api";

interface DeleteRoutingRuleDialogProperties {
  readonly rule: RoutingRuleResponse;
  readonly onDeleted: () => Promise<void>;
  readonly onCancel: () => void;
}

const maximumChangeReasonLength = 512;

export function DeleteRoutingRuleDialog({
  rule,
  onDeleted,
  onCancel,
}: DeleteRoutingRuleDialogProperties) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState<RoutingRuleDeleteImpact | null>(null);
  const [errorKey, setErrorKey] = useState<RoutingErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void getRoutingRuleDeleteImpact(rule.id)
      .then(setImpact)
      .catch((error) => setErrorKey(mapRoutingError(error)));
  }, [rule.id]);

  const onConfirm = async () => {
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await deleteRoutingRule(rule.id, {
        originUnitId: rule.originUnitId,
        serviceId: rule.serviceId,
        reason: reason.trim(),
      });
      await onDeleted();
    } catch (error) {
      setErrorKey(mapRoutingError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid gap-3 rounded-md border border-danger/25 bg-danger/5 px-3 py-3">
      <p className="text-[12.5px] text-text/90">{t("routing.deleteConfirmTitle")}</p>
      {impact ? (
        <p className="text-[12px] leading-5 text-text/80">
          {t("routing.deleteImpact", {
            before: impact.before.outcome,
            after: impact.after.outcome,
            group: impact.after.groupId ?? t("routing.noGroup"),
          })}
        </p>
      ) : null}
      <Field label={t("routing.reason")} required hint={t("routing.reasonHint")}>
        <Textarea
          value={reason}
          required
          maxLength={maximumChangeReasonLength}
          className="min-h-14"
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {errorKey ? <p className={errorTextClassName}>{t(errorKey)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="xs"
          variant="danger"
          disabled={isSubmitting || reason.trim().length === 0}
          onClick={() => void onConfirm()}
        >
          {isSubmitting ? t("routing.deleting") : t("routing.confirmDelete")}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>
          {t("routing.cancel")}
        </Button>
      </div>
    </div>
  );
}
