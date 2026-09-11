import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { tableHeadClassName, tableRowClassName, tableWrapClassName } from "@/components/ui/control";
import type { SlaRule } from "@/services/sla-api";

interface SlaRulesTableProperties {
  readonly rules: readonly SlaRule[];
  readonly onEdit: (rule: SlaRule) => void;
  readonly onDelete: (rule: SlaRule) => void;
}

export function SlaRulesTable({ rules, onEdit, onDelete }: SlaRulesTableProperties) {
  const { t } = useTranslation();
  return (
    <div className={tableWrapClassName}>
      <table className="w-full min-w-[720px] text-left">
        <thead>
          <tr className="border-b border-border/70">
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.priority")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.responseMinutes")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.resolutionMinutes")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.evaluationOrder")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>{t("sla.match")}</th>
            <th className={`${tableHeadClassName} px-4 py-2.5`} />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className={tableRowClassName}>
              <td className="px-4 text-[12.5px]">{rule.priority}</td>
              <td className="px-4 tnum text-[12.5px]">{rule.responseMinutes}</td>
              <td className="px-4 tnum text-[12.5px]">{rule.resolutionMinutes}</td>
              <td className="px-4 tnum text-[12.5px]">{rule.evaluationOrder}</td>
              <td className="px-4 text-[12px] text-muted-foreground">
                {[rule.serviceName, rule.organizationalUnitPath].filter(Boolean).join(" · ") ||
                  t("sla.matchDefault")}
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
