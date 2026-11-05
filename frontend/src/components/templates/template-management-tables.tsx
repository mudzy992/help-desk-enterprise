import { ClipboardList, FileText, Pencil, Trash2, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { TemplateScopeCell } from "@/components/templates/template-scope-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tableHeadClassName, tableRowClassName, tableWrapClassName } from "@/components/ui/control";
import { RelativeTime } from "@/components/ui/relative-time";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { cn } from "@/lib/utils";
import type { Playbook, ResponseTemplate } from "@/services/templates-api";

export function TemplateTable({
  items,
  locale,
  onDelete,
}: {
  readonly items: readonly ResponseTemplate[];
  readonly locale: string;
  readonly onDelete: (item: ResponseTemplate) => void;
}) {
  const { t } = useTranslation();
  return (
    <ScrollRegion className={tableWrapClassName}>
      <table className="w-full text-left text-[12.5px]" data-testid="templates-table">
        <thead className={tableHeadClassName}>
          <tr className="border-b border-border/70 [&>th]:px-3 [&>th]:py-2">
            <th>{t("templates.list.name")}</th>
            <th>{t("templates.list.kind")}</th>
            <th>{t("templates.list.scope")}</th>
            <th className="text-right">{t("templates.list.usage")}</th>
            <th>{t("templates.list.updated")}</th>
            <th>{t("templates.list.state")}</th>
            <th className="sr-only">{t("templates.actions.edit")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={cn(tableRowClassName, "[&>td]:px-3")}>
              <td className="max-w-[320px]">
                <Link
                  to={`/admin/templates/${item.id}`}
                  className="flex items-center gap-1.5 font-medium text-foreground hover:text-link"
                >
                  {item.ownership === "personal" ? <User size={12} /> : <FileText size={12} />}
                  <span className="truncate">{item.name}</span>
                </Link>
                {item.tags.length > 0 ? (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {item.tags.map((tag) => `#${tag}`).join(" ")}
                  </p>
                ) : null}
              </td>
              <td>{t(`templates.kind.${item.kind}`)}</td>
              <td>
                {item.ownership === "personal" ? (
                  <Badge>{t("templates.picker.personal")}</Badge>
                ) : (
                  <TemplateScopeCell
                    serviceIds={item.serviceIds}
                    categoryIds={item.categoryIds}
                    groupIds={item.groupIds}
                  />
                )}
              </td>
              <td className="tnum text-right">
                {t("templates.list.usageCount", { count: item.usageCount })}
              </td>
              <td className="text-muted-foreground">
                <RelativeTime value={item.updatedAt} locale={locale} />
              </td>
              <td>
                <Badge tone={item.isActive ? "success" : "neutral"} dot>
                  {item.isActive ? t("templates.state.active") : t("templates.state.inactive")}
                </Badge>
              </td>
              <td className="whitespace-nowrap text-right">
                <RowActions
                  editTo={`/admin/templates/${item.id}`}
                  canEdit={item.canEdit}
                  onDelete={() => onDelete(item)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

export function PlaybookTable({
  items,
  locale,
  onDelete,
}: {
  readonly items: readonly Playbook[];
  readonly locale: string;
  readonly onDelete: (item: Playbook) => void;
}) {
  const { t } = useTranslation();
  return (
    <ScrollRegion className={tableWrapClassName}>
      <table className="w-full text-left text-[12.5px]" data-testid="playbooks-table">
        <thead className={tableHeadClassName}>
          <tr className="border-b border-border/70 [&>th]:px-3 [&>th]:py-2">
            <th>{t("templates.list.name")}</th>
            <th>{t("templates.list.scope")}</th>
            <th className="text-right">{t("templates.list.steps")}</th>
            <th className="text-right">{t("templates.list.tickets")}</th>
            <th className="text-right">{t("templates.list.version")}</th>
            <th>{t("templates.list.updated")}</th>
            <th>{t("templates.list.state")}</th>
            <th className="sr-only">{t("templates.actions.edit")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={cn(tableRowClassName, "[&>td]:px-3")}>
              <td className="max-w-[320px]">
                <Link
                  to={`/admin/templates/playbooks/${item.id}`}
                  className="flex items-center gap-1.5 font-medium text-foreground hover:text-link"
                >
                  <ClipboardList size={12} />
                  <span className="truncate">{item.name}</span>
                </Link>
                {item.description ? (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {item.description}
                  </p>
                ) : null}
              </td>
              <td>
                <TemplateScopeCell serviceIds={item.serviceIds} categoryIds={item.categoryIds} />
              </td>
              <td className="tnum text-right">
                {item.steps.length}
                {item.steps.some((step) => step.required) ? (
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    ({item.steps.filter((step) => step.required).length}{" "}
                    {t("templates.checklist.requiredBadge").toLocaleLowerCase()})
                  </span>
                ) : null}
              </td>
              <td className="tnum text-right">{item.activeTicketCount}</td>
              <td className="tnum text-right">v{item.version}</td>
              <td className="text-muted-foreground">
                <RelativeTime value={item.updatedAt} locale={locale} />
              </td>
              <td>
                <Badge tone={item.isActive ? "success" : "neutral"} dot>
                  {item.isActive ? t("templates.state.active") : t("templates.state.inactive")}
                </Badge>
              </td>
              <td className="whitespace-nowrap text-right">
                <RowActions
                  editTo={`/admin/templates/playbooks/${item.id}`}
                  canEdit={item.canEdit}
                  onDelete={() => onDelete(item)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

function RowActions({
  editTo,
  canEdit,
  onDelete,
}: {
  readonly editTo: string;
  readonly canEdit: boolean;
  readonly onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center gap-1">
      <Button asChild variant="ghost" size="xs">
        <Link to={editTo}>
          <Pencil size={12} /> {canEdit ? t("templates.actions.edit") : t("templates.actions.view")}
        </Link>
      </Button>
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onDelete}
          aria-label={t("templates.actions.delete")}
        >
          <Trash2 size={12} />
        </Button>
      ) : null}
    </div>
  );
}
