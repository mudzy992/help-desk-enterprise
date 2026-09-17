import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import type { SlaEscalationRule } from "@/services/sla-api";

interface SlaEscalationRulesTableProperties {
  readonly rules: readonly SlaEscalationRule[];
  readonly onEdit: (rule: SlaEscalationRule) => void;
  readonly onDelete: (rule: SlaEscalationRule) => void;
}

export function SlaEscalationRulesTable({
  rules,
  onEdit,
  onDelete,
}: SlaEscalationRulesTableProperties) {
  const { t } = useTranslation();
  return (
    <div className={tableWrapClassName}>
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-border/70">
            <th className={`${tableHeadClassName} px-4 py-2.5`}>
              {t("sla.escalationLevel")}
            </th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>
              {t("sla.triggerOffsetMinutes")}
            </th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>
              {t("sla.escalationTarget")}
            </th>
            <th className={`${tableHeadClassName} px-4 py-2.5`} />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className={tableRowClassName}>
              <td className="px-4 text-[12.5px]">{rule.level}</td>
              <td className="px-4 tnum text-[12.5px]">{rule.triggerOffsetMinutes}</td>
              <td className="px-4 text-[12px] text-muted-foreground">
                {rule.targetRole
                  ? `role:${rule.targetRole}`
                  : rule.targetUserId
                    ? `user:${rule.targetUserId}`
                    : rule.targetGroupId
                      ? `group:${rule.targetGroupId}`
                      : "—"}
              </td>
              <td className="px-4 text-right">
                <Button variant="ghost" size="xs" onClick={() => onEdit(rule)}>
                  {t("sla.edit")}
                </Button>
                <Button variant="ghost" size="xs" onClick={() => onDelete(rule)}>
                  {t("sla.delete")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
