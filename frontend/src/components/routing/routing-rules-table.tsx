import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RoutingRuleRow } from "@/components/routing/routing-rule-row";
import { EmptyState } from "@/components/ui/empty-state";
import { tableHeadClassName } from "@/components/ui/control";
import type {
  RoutingHandlerGroup,
  RoutingRuleResponse,
} from "@/services/routing-api";

interface RoutingRulesTableProperties {
  readonly rules: readonly RoutingRuleResponse[];
  readonly groups: readonly RoutingHandlerGroup[];
  readonly onChanged: () => Promise<void>;
}

export function RoutingRulesTable({
  rules,
  groups,
  onChanged,
}: RoutingRulesTableProperties) {
  const { t, i18n } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
            <th className={`${tableHeadClassName} px-4 py-2.5 text-right`}>
              {t("routing.columnActions")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rules.map((rule) => (
            <RoutingRuleRow
              key={rule.id}
              rule={rule}
              groups={groups}
              locale={i18n.language}
              isEditing={editingId === rule.id}
              isDeleting={deletingId === rule.id}
              onEdit={() => {
                setDeletingId(null);
                setEditingId(rule.id);
              }}
              onDelete={() => {
                setEditingId(null);
                setDeletingId(rule.id);
              }}
              onCancel={() => {
                setEditingId(null);
                setDeletingId(null);
              }}
              onChanged={async () => {
                setEditingId(null);
                setDeletingId(null);
                await onChanged();
              }}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
