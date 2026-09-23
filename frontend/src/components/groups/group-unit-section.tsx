import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { GroupCard } from "@/components/groups/group-card";
import type { GroupListItemResponse } from "@/services/groups-api";

interface GroupUnitSectionProperties {
  readonly organizationalUnitPath: string;
  readonly groups: readonly GroupListItemResponse[];
  readonly routingRuleCounts: ReadonlyMap<string, number>;
  readonly expandedId: string | null;
  readonly canWrite: boolean;
  readonly confirmDeleteId: string | null;
  readonly pendingId: string | null;
  readonly detail: ReactNode;
  readonly onOpen: (groupId: string) => void;
  readonly onEdit: (groupId: string) => void;
  readonly onRequestDelete: (groupId: string) => void;
  readonly onConfirmDelete: (groupId: string) => void;
  readonly onCancelDelete: () => void;
}

export function GroupUnitSection({
  organizationalUnitPath,
  groups,
  routingRuleCounts,
  expandedId,
  canWrite,
  confirmDeleteId,
  pendingId,
  detail,
  onOpen,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: GroupUnitSectionProperties) {
  const { t } = useTranslation();
  const sectionContainsExpanded = groups.some((group) => group.id === expandedId);
  return (
    <section className="grid gap-2.5">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/70 pb-1.5">
        <h4 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {organizationalUnitPath}
        </h4>
        <span className="text-[11px] text-muted-foreground/80">
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
            confirmDelete={confirmDeleteId === group.id}
            isPending={pendingId === group.id}
            onOpen={() => onOpen(group.id)}
            onEdit={() => onEdit(group.id)}
            onRequestDelete={() => onRequestDelete(group.id)}
            onConfirmDelete={() => onConfirmDelete(group.id)}
            onCancelDelete={onCancelDelete}
          />
        ))}
      </div>
      {sectionContainsExpanded ? detail : null}
    </section>
  );
}
