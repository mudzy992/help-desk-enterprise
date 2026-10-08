import { useTranslation } from "react-i18next";
import { GroupCard } from "@/components/groups/group-card";
import type { GroupListItemResponse } from "@/services/groups-api";

interface GroupUnitSectionProperties {
  readonly organizationalUnitPath: string;
  readonly groups: readonly GroupListItemResponse[];
  readonly routingRuleCounts: ReadonlyMap<string, number>;
  readonly expandedId: string | null;
  readonly canWrite: boolean;
  readonly pendingId: string | null;
  readonly onOpenMembers: (groupId: string) => void;
  readonly onEdit: (groupId: string) => void;
  readonly onRequestDelete: (groupId: string) => void;
}

export function GroupUnitSection({
  organizationalUnitPath,
  groups,
  routingRuleCounts,
  expandedId,
  canWrite,
  pendingId,
  onOpenMembers,
  onEdit,
  onRequestDelete,
}: GroupUnitSectionProperties) {
  const { t } = useTranslation();
  return (
    <section className="grid gap-2.5">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/70 pb-1.5">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {organizationalUnitPath}
        </h4>
        <span className="text-[11px] text-muted-foreground">
          {t("groups.unitGroupCount", { count: groups.length })}
        </span>
      </header>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            routingRuleCount={routingRuleCounts.get(group.id) ?? 0}
            isExpanded={expandedId === group.id}
            canWrite={canWrite}
            isPending={pendingId === group.id}
            onOpenMembers={() => onOpenMembers(group.id)}
            onEdit={() => onEdit(group.id)}
            onRequestDelete={() => onRequestDelete(group.id)}
          />
        ))}
      </div>
    </section>
  );
}
