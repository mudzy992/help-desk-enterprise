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
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral" dot={false} className="max-w-full text-[11px]">
                {rule.originUnitPath}
              </Badge>
              <span aria-hidden="true" className="text-[11px] text-muted-foreground">
                +
              </span>
              <Badge tone="neutral" dot={false} className="max-w-full text-[11px]">
                {rule.serviceName}
              </Badge>
            </div>
            <code className="text-[9.5px] text-muted-foreground" title={rule.id}>
              {t("routing.ruleId")}: {truncateIdentifier(rule.id).toUpperCase()}
            </code>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-muted-foreground">
              →
            </span>
            <Badge tone="primary" dot={false}>
              {rule.groupName}
            </Badge>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">
          <RelativeTime value={rule.updatedAt} locale={locale} />
        </td>
        <td className="px-4 py-3 text-right">
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
          <td colSpan={4} className="px-4 py-3">
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
