import { ShieldAlert, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GroupListItemResponse } from "@/services/groups-api";

interface GroupCardProperties {
  readonly group: GroupListItemResponse;
  readonly routingRuleCount: number;
  readonly isExpanded: boolean;
  readonly canWrite: boolean;
  readonly confirmDelete: boolean;
  readonly isPending: boolean;
  readonly onOpen: () => void;
  readonly onEdit: () => void;
  readonly onRequestDelete: () => void;
  readonly onConfirmDelete: () => void;
  readonly onCancelDelete: () => void;
}

export function GroupCard({
  group,
  routingRuleCount,
  isExpanded,
  canWrite,
  confirmDelete,
  isPending,
  onOpen,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: GroupCardProperties) {
  const { t } = useTranslation();
  return (
    <Card
      className={cn(
        "overflow-hidden transition-colors hover:border-[#31405C]",
        group.isFallback && "border-l-[3px] border-l-warning",
        isExpanded && "border-[#31405C] bg-elevated/40",
      )}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
        onClick={onOpen}
        aria-expanded={isExpanded}
        aria-label={t("groups.openCard", { name: group.name })}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-elevated text-muted-foreground">
          <UsersRound size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[13.5px] font-semibold text-foreground">{group.name}</p>
            {group.isFallback ? (
              <Badge tone="warning" dot={false}>
                <ShieldAlert size={11} />
                {t("groups.fallbackBadge")}
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {group.isFallback
              ? t("groups.fallbackForUnit", { unit: group.organizationalUnitPath })
              : group.organizationalUnitPath}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            {t("groups.routingRuleCount", { count: routingRuleCount })}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[22px] font-semibold leading-none tabular-nums text-foreground">
            {group.memberCount}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("groups.membersMetric")}
          </p>
        </div>
      </button>
      <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-4 py-2">
        <Button type="button" size="xs" variant="outline" onClick={onOpen}>
          {isExpanded ? t("groups.hideMembers") : t("groups.manageMembers")}
        </Button>
        {canWrite ? (
          <>
            <Button type="button" size="xs" variant="outline" onClick={onEdit}>
              {t("groups.edit")}
            </Button>
            {confirmDelete ? (
              <>
                <Button
                  type="button"
                  size="xs"
                  variant="danger"
                  disabled={isPending}
                  onClick={onConfirmDelete}
                >
                  {isPending ? t("groups.deleting") : t("groups.confirmDelete")}
                </Button>
                <Button type="button" size="xs" variant="ghost" onClick={onCancelDelete}>
                  {t("groups.cancel")}
                </Button>
              </>
            ) : (
              <Button type="button" size="xs" variant="danger" onClick={onRequestDelete}>
                {t("groups.delete")}
              </Button>
            )}
          </>
        ) : null}
      </div>
    </Card>
  );
}
