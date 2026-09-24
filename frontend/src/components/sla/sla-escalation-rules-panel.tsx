import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlaEscalationRuleForm } from "@/components/sla/sla-escalation-rule-form";
import { SlaEscalationRulesTable } from "@/components/sla/sla-escalation-rules-table";
import { Card, CardHeader } from "@/components/ui/card";
import { controlClassName } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { mapSlaError, type SlaErrorKey } from "@/lib/sla/map-sla-error";
import {
  createSlaEscalationRule,
  deleteSlaEscalationRule,
  listSlaEscalationRules,
  updateSlaEscalationRule,
  type EscalationRuleWriteInput,
  type SlaEscalationRule,
} from "@/services/sla-api";

interface SlaEscalationRulesPanelProperties {
  readonly slaProfileId: string;
  readonly canWrite?: boolean;
  readonly embedded?: boolean;
}

export function SlaEscalationRulesPanel({
  slaProfileId,
  canWrite = true,
  embedded = false,
}: SlaEscalationRulesPanelProperties) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<SlaEscalationRule[]>([]);
  const [editing, setEditing] = useState<SlaEscalationRule | undefined>();
  const [deleteReason, setDeleteReason] = useState("");
  const [errorKey, setErrorKey] = useState<SlaErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setEditing(undefined);
    if (slaProfileId.length === 0) {
      setRules([]);
      return;
    }
    void listSlaEscalationRules(slaProfileId).then((items) => setRules([...items]));
  }, [slaProfileId]);

  const reload = async () => {
    setRules([...(await listSlaEscalationRules(slaProfileId))]);
  };

  const handleSave = async (input: EscalationRuleWriteInput) => {
    if (!canWrite || slaProfileId.length === 0) return;
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      if (editing === undefined) {
        await createSlaEscalationRule({ ...input, slaProfileId });
      } else {
        await updateSlaEscalationRule(editing.id, input);
      }
      setEditing(undefined);
      await reload();
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (rule: SlaEscalationRule) => {
    if (!canWrite || deleteReason.trim().length === 0) return;
    setIsSubmitting(true);
    setErrorKey(null);
    try {
      await deleteSlaEscalationRule(rule.id, deleteReason);
      setDeleteReason("");
      await reload();
    } catch (error) {
      setErrorKey(mapSlaError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const table = rules.length === 0 ? (
    <EmptyState title={t("sla.escalationsHeading")} body={t("sla.escalationsEmptyBody")} />
  ) : (
    <SlaEscalationRulesTable
      rules={rules}
      canWrite={canWrite}
      onEdit={setEditing}
      onDelete={(rule) => void handleDelete(rule)}
    />
  );

  const form = canWrite ? (
    <div className={embedded ? "mt-3 space-y-3" : "p-4"}>
      <SlaEscalationRuleForm
        rule={editing}
        errorKey={errorKey}
        isSubmitting={isSubmitting}
        onSubmit={handleSave}
      />
      <label className="grid max-w-md gap-1 text-sm">
        {t("sla.reason")}
        <input
          className={controlClassName}
          value={deleteReason}
          onChange={(event) => setDeleteReason(event.target.value)}
          placeholder={t("sla.deleteReasonPlaceholder")}
        />
      </label>
    </div>
  ) : null;

  if (embedded) {
    return (
      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
          {t("sla.escalationsHeading")}
        </p>
        {table}
        {form}
      </div>
    );
  }

  return (
    <div className="fade-in grid gap-4">
      <Card>
        <CardHeader title={t("sla.escalationsHeading")} subtitle={t("sla.escalationsHint")} />
        {table}
      </Card>
      {canWrite ? (
        <Card>
          <CardHeader title={editing ? t("sla.editEscalation") : t("sla.newEscalation")} />
          {form}
        </Card>
      ) : null}
    </div>
  );
}
