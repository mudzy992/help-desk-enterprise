import { useTranslation } from "react-i18next";
import { SlaRuleForm } from "@/components/sla/sla-rule-form";
import { SlaRulesTable } from "@/components/sla/sla-rules-table";
import { Button } from "@/components/ui/button";
import { controlClassName } from "@/components/ui/control";
import { isBaselineSlaRule } from "@/lib/sla/select-baseline-sla-rules";
import type { RuleWriteInput, SlaRule } from "@/services/sla-api";

interface SlaBaselineRulesEditorProperties {
  readonly rules: readonly SlaRule[];
  readonly editingRule: SlaRule | undefined;
  readonly errorKey: string | null;
  readonly isSubmitting: boolean;
  readonly deleteReason: string;
  readonly onDeleteReasonChange: (value: string) => void;
  readonly onEdit: (rule: SlaRule) => void;
  readonly onDeleteRule: (rule: SlaRule) => void;
  readonly onSaveRule: (input: RuleWriteInput, editing?: SlaRule) => Promise<void>;
  readonly onClearEditing: () => void;
  readonly onDeleteProfile: () => void;
}

export function SlaBaselineRulesEditor({
  rules,
  editingRule,
  errorKey,
  isSubmitting,
  deleteReason,
  onDeleteReasonChange,
  onEdit,
  onDeleteRule,
  onSaveRule,
  onClearEditing,
  onDeleteProfile,
}: SlaBaselineRulesEditorProperties) {
  const { t } = useTranslation();
  const activeEdit =
    editingRule && isBaselineSlaRule(editingRule) ? editingRule : undefined;

  return (
    <div className="space-y-3">
      {rules.length > 0 ? (
        <SlaRulesTable rules={rules} onEdit={onEdit} onDelete={onDeleteRule} />
      ) : null}
      <SlaRuleForm
        key={activeEdit?.id ?? "new-baseline-rule"}
        rule={activeEdit}
        errorKey={errorKey}
        isSubmitting={isSubmitting}
        onSubmit={async (input) => {
          await onSaveRule(input, activeEdit);
          onClearEditing();
        }}
      />
      <div className="flex flex-wrap items-end gap-2">
        <input
          className={`${controlClassName} h-8 w-44`}
          value={deleteReason}
          onChange={(event) => onDeleteReasonChange(event.target.value)}
          placeholder={t("sla.reason")}
        />
        <Button type="button" variant="destructive" size="xs" onClick={onDeleteProfile}>
          {t("sla.deleteProfile")}
        </Button>
      </div>
    </div>
  );
}
