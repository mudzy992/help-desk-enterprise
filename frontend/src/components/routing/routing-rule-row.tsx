import { useTranslation } from "react-i18next";
import { DeleteRoutingRuleDialog } from "@/components/routing/delete-routing-rule-dialog";
import { EditRoutingRuleForm } from "@/components/routing/edit-routing-rule-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tableRowClassName } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/relative-time";
import { truncateIdentifier } from "@/lib/tickets/ticket-display";
import type {
  RoutingHandlerGroup,
  RoutingRuleResponse,
} from "@/services/routing-api";

interface RoutingRuleRowProperties {
  readonly rule: RoutingRuleResponse;
  readonly groups: readonly RoutingHandlerGroup[];
  readonly locale: string;
  readonly isEditing: boolean;
  readonly isDeleting: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onCancel: () => void;
  readonly onChanged: () => Promise<void>;
}

export function RoutingRuleRow({
  rule,
  groups,
  locale,
  isEditing,
  isDeleting,
  onEdit,
  onDelete,
  onCancel,
  onChanged,
}: RoutingRuleRowProperties) {
  const { t } = useTranslation();
  return (
    <>
      <tr className={tableRowClassName}>
        <td
          className="px-4 py-2.5 tnum text-[12px] font-medium text-[#7FA8F5]"
          title={rule.id}
        >
          {truncateIdentifier(rule.id).toUpperCase()}
        </td>
        <td className="px-4 py-2.5">
          <span className="block text-[12px] text-text/90">{rule.originUnitPath}</span>
        </td>
        <td className="px-4 py-2.5 text-[12px] text-text/85">{rule.serviceName}</td>
        <td className="px-4 py-2.5">
          <Badge tone="primary" dot={false}>
            {rule.groupName}
          </Badge>
        </td>
        <td className="px-4 py-2.5 text-right text-[11px] text-muted">
          <RelativeTime value={rule.updatedAt} locale={locale} />
        </td>
        <td className="px-4 py-2.5 text-right">
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button type="button" size="xs" variant="outline" onClick={onEdit}>
              {t("routing.edit")}
            </Button>
            <Button type="button" size="xs" variant="danger" onClick={onDelete}>
              {t("routing.delete")}
            </Button>
          </div>
        </td>
      </tr>
      {isEditing || isDeleting ? (
        <tr>
          <td colSpan={6} className="px-4 py-3">
            {isEditing ? (
              <EditRoutingRuleForm
                rule={rule}
                groups={groups}
                onUpdated={onChanged}
                onCancel={onCancel}
              />
            ) : (
              <DeleteRoutingRuleDialog
                rule={rule}
                onDeleted={onChanged}
                onCancel={onCancel}
              />
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
