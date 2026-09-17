import { useTranslation } from "react-i18next";
import { SlaRuleForm } from "@/components/sla/sla-rule-form";
import { SlaRulesTable } from "@/components/sla/sla-rules-table";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { RuleWriteInput, SlaRule } from "@/services/sla-api";

interface SlaOverrideRulesCardProperties {
  readonly rules: readonly SlaRule[];
  readonly editingRule: SlaRule | undefined;
  readonly canWrite: boolean;
  readonly errorKey: string | null;
  readonly isSubmitting: boolean;
  readonly onEdit: (rule: SlaRule) => void;
  readonly onDelete: (rule: SlaRule) => void;
  readonly onSubmit: (input: RuleWriteInput) => Promise<void>;
}

export function SlaOverrideRulesCard({
  rules,
  editingRule,
  canWrite,
  errorKey,
  isSubmitting,
  onEdit,
  onDelete,
  onSubmit,
}: SlaOverrideRulesCardProperties) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader title={t("sla.overrideRulesHeading")} subtitle={t("sla.overrideRulesHint")} />
      <div className="space-y-4 px-4 py-3.5">
        {rules.length > 0 ? (
          <SlaRulesTable
            rules={rules}
            onEdit={canWrite ? onEdit : () => undefined}
            onDelete={canWrite ? onDelete : () => undefined}
          />
        ) : (
          <EmptyState
            title={t("sla.overrideRulesEmptyTitle")}
            body={t("sla.overrideRulesEmptyBody")}
          />
        )}
        {canWrite ? (
          <SlaRuleForm
            key={editingRule?.id ?? "new-override-rule"}
            rule={editingRule}
            errorKey={errorKey}
            isSubmitting={isSubmitting}
            onSubmit={onSubmit}
          />
        ) : null}
      </div>
    </Card>
  );
}
