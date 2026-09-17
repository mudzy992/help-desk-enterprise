import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  tableHeadClassName,
  tableRowClassName,
  tableWrapClassName,
} from "@/components/ui/control";
import { formatSlaEscalationTarget } from "@/lib/sla/format-sla-escalation-target";
import type { SlaEscalationRule } from "@/services/sla-api";

interface SlaEscalationRulesTableProperties {
  readonly rules: readonly SlaEscalationRule[];
  readonly canWrite?: boolean;
  readonly onEdit: (rule: SlaEscalationRule) => void;
  readonly onDelete: (rule: SlaEscalationRule) => void;
}

export function SlaEscalationRulesTable({
  rules,
  canWrite = true,
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
            {canWrite ? <th className={`${tableHeadClassName} px-4 py-2.5`} /> : null}
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className={tableRowClassName}>
              <td className="px-4 text-[12.5px]">{rule.level}</td>
              <td className="px-4 tnum text-[12.5px]">{rule.triggerOffsetMinutes}</td>
              <td className="px-4 text-[12px] text-muted-foreground">
                {formatSlaEscalationTarget(rule, t)}
              </td>
              {canWrite ? (
                <td className="px-4 text-right">
                  <Button variant="ghost" size="xs" onClick={() => onEdit(rule)}>
                    {t("sla.edit")}
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => onDelete(rule)}>
                    {t("sla.delete")}
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
