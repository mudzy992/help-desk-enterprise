import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  tableHeadClassName,
  tableRowClassName,
} from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/relative-time";
import { truncateIdentifier } from "@/lib/tickets/ticket-display";
import type { RoutingRuleResponse } from "@/services/routing-api";

interface RoutingRulesTableProperties {
  readonly rules: readonly RoutingRuleResponse[];
}

export function RoutingRulesTable({ rules }: RoutingRulesTableProperties) {
  const { t, i18n } = useTranslation();
  if (rules.length === 0) {
    return (
      <EmptyState
        title={t("routing.rulesEmptyTitle")}
        body={t("routing.rulesEmptyHint")}
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="border-b border-border/70 text-left">
            <th className={`${tableHeadClassName} px-4 py-2.5`}>
              {t("routing.columnRule")}
            </th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>
              {t("routing.columnOriginUnit")}
            </th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>
              {t("routing.columnService")}
            </th>
            <th className={`${tableHeadClassName} px-4 py-2.5`}>
              {t("routing.columnGroup")}
            </th>
            <th className={`${tableHeadClassName} px-4 py-2.5 text-right`}>
              {t("routing.columnUpdatedAt")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rules.map((rule) => (
            <tr key={rule.id} className={tableRowClassName}>
              <td
                className="px-4 py-2.5 tnum text-[12px] font-medium text-[#7FA8F5]"
                title={rule.id}
              >
                {truncateIdentifier(rule.id).toUpperCase()}
              </td>
              <td className="px-4 py-2.5">
                <span className="block text-[12px] text-text/90">
                  {rule.originUnitPath}
                </span>
              </td>
              <td className="px-4 py-2.5 text-[12px] text-text/85">
                {rule.serviceName}
              </td>
              <td className="px-4 py-2.5">
                <Badge tone="primary" dot={false}>
                  {rule.groupName}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-right text-[11px] text-muted">
                <RelativeTime value={rule.updatedAt} locale={i18n.language} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
