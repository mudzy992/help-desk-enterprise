import { Plus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GroupDetailDrawer } from "@/components/groups/group-detail-drawer";
import { GroupMutationForm } from "@/components/groups/group-mutation-form";
import { GroupUnitSection } from "@/components/groups/group-unit-section";
import { ApiErrorText } from "@/components/ui/api-error-text";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import { groupGroupsByUnit } from "@/lib/groups/group-groups-by-unit";
import { useGroupsPanelActions } from "@/lib/groups/use-groups-panel-actions";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import type { DeleteImpactState } from "@/lib/groups/use-groups-panel-actions";
import type { GroupDeleteDependency, GroupListItemResponse } from "@/services/groups-api";

interface GroupsPanelProperties {
  readonly groups: readonly GroupListItemResponse[];
  readonly routingRuleCounts: ReadonlyMap<string, number> | null;
  readonly originUnits: readonly OriginUnitOption[];
  readonly users: readonly DirectoryUser[];
  readonly canWrite: boolean;
  readonly onCreate: () => void;
  readonly onChanged: () => Promise<void>;
  readonly showCreateForm: boolean;
  readonly onCancelCreate: () => void;
  readonly onSubmitCreate: (input: {
    readonly name: string;
    readonly organizationalUnitId: string;
    readonly isFallback: boolean;
    readonly isProblemGroup: boolean;
    readonly isCabGroup: boolean;
  }) => Promise<void>;
  readonly createPending: boolean;
}

export function GroupsPanel({
  groups,
  routingRuleCounts,
  originUnits,
  users,
  canWrite,
  onCreate,
  onChanged,
  showCreateForm,
  onCancelCreate,
  onSubmitCreate,
  createPending,
}: GroupsPanelProperties) {
  const { t } = useTranslation();
  const actions = useGroupsPanelActions(onChanged);
  const sections = useMemo(() => groupGroupsByUnit(groups), [groups]);

  if (groups.length === 0 && !showCreateForm) {
    return (
      <EmptyState
        title={t("groups.emptyTitle")}
        body={t("groups.emptyBody")}
        action={
          canWrite ? (
            <Button type="button" size="sm" onClick={onCreate}>
              <Plus size={14} />
              {t("groups.create")}
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="fade-in grid gap-4">
      {actions.errorKey ? (
        <ApiErrorText messageKey={actions.errorKey} requestId={actions.requestId} />
      ) : null}
      {showCreateForm ? (
        <GroupMutationForm
          originUnits={originUnits}
          pending={createPending}
          onSubmit={(input) => void onSubmitCreate(input)}
          onCancel={onCancelCreate}
        />
      ) : null}
      {sections.map((section) => (
        <GroupUnitSection
          key={section.organizationalUnitId}
          organizationalUnitPath={section.organizationalUnitPath}
          groups={section.groups}
          routingRuleCounts={routingRuleCounts}
          expandedId={actions.drawerGroupId}
          canWrite={canWrite}
          pendingId={actions.pendingId}
          onOpenMembers={(groupId) => actions.openGroup(groupId, "members")}
          onEdit={(groupId) => actions.openGroup(groupId, "edit")}
          onRequestDelete={(groupId) => {
            const target = groups.find((group) => group.id === groupId);
            if (target !== undefined) {
              actions.requestDelete(target);
            }
          }}
        />
      ))}
      <GroupDetailDrawer
        open={actions.drawerGroupId !== null}
        onOpenChange={(open) => {
          if (!open) {
            actions.closeGroup();
          }
        }}
        tab={actions.drawerTab}
        onTabChange={actions.setDrawerTab}
        group={
          actions.drawerGroupId === null
            ? null
            : (groups.find((group) => group.id === actions.drawerGroupId) ?? null)
        }
        detail={actions.detail}
        originUnits={originUnits}
        users={users}
        canWrite={canWrite}
        isPending={actions.pendingId === actions.drawerGroupId}
        onSaveEdit={actions.saveEdit}
        onMembersChanged={actions.onMembersChanged}
      />
      {/*
        Paket 5.3.2 (§4.3): deleting a group asks once, in the shared danger
        dialog, and names the group so the confirmation carries no ambiguity.
      */}
      <ConfirmDialog
        open={actions.deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            actions.cancelDelete();
          }
        }}
        intent="danger"
        isPending={actions.pendingId !== null && actions.deleteTarget?.id === actions.pendingId}
        title={t("groups.deleteConfirmTitle", {
          name: actions.deleteTarget?.name ?? "",
        })}
        description={t("groups.deleteConfirmBody", {
          count: actions.deleteTarget?.memberCount ?? 0,
        })}
        confirmLabel={t("groups.delete")}
        confirmDisabled={
          actions.deleteImpact.status === "ready" && actions.deleteImpact.impact.blockers.length > 0
        }
        onConfirm={() => void actions.confirmRemove()}
      >
        {/*
          W2.12 (BA-groups-01): the operator sees what the delete touches -
          blocked dependencies first, then rows that are only detached, then rows
          that disappear for good - instead of discovering a cascade afterwards.
        */}
        <GroupDeleteImpact impact={actions.deleteImpact} />
      </ConfirmDialog>
    </div>
  );
}

const dependencyKindKeys = [
  "fallbackGroups",
  "activeTickets",
  "onCallSchedule",
  "teamsChannel",
  "responseTemplates",
  "routingRules",
  "problemHandoffs",
  "confidentialGrants",
  "openProblems",
  "openChanges",
  "closedTickets",
  "ticketParticipants",
  "knowledgeArticles",
  "slaEscalationRules",
  "reportSchedules",
  "assetTypes",
  "closedProblems",
  "closedChanges",
  "notifications",
] as const;

type DependencyKind = (typeof dependencyKindKeys)[number];

function isKnownKind(kind: string): kind is DependencyKind {
  return (dependencyKindKeys as readonly string[]).includes(kind);
}

function DependencyList({
  dependencies,
  testId,
}: {
  readonly dependencies: readonly GroupDeleteDependency[];
  readonly testId: string;
}) {
  const { t } = useTranslation();
  return (
    <ul className="list-disc pl-5 text-sm" data-testid={testId}>
      {dependencies.map((dependency) => (
        <li key={dependency.kind}>
          {t(
            isKnownKind(dependency.kind)
              ? `groups.dependency.${dependency.kind}`
              : "groups.dependency.unknown",
            { count: dependency.count, kind: dependency.kind },
          )}
        </li>
      ))}
    </ul>
  );
}

function GroupDeleteImpact({ impact }: { readonly impact: DeleteImpactState }) {
  const { t } = useTranslation();
  if (impact.status === "loading") {
    return (
      <p className="text-sm text-muted-foreground" data-testid="group-delete-impact-loading">
        {t("groups.deleteImpactLoading")}
      </p>
    );
  }
  if (impact.status === "unavailable") {
    // The server still refuses the delete on its own; saying nothing is safer
    // than claiming the group is unused.
    return null;
  }
  const { blockers, detached, cascaded } = impact.impact;
  return (
    <div className="space-y-3">
      {blockers.length === 0 ? null : (
        <div className="space-y-1" data-testid="group-delete-blockers">
          <p className="text-sm font-medium">{t("groups.deleteImpactBlockedTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("groups.deleteImpactBlockedBody")}</p>
          <DependencyList dependencies={blockers} testId="group-delete-blocker-list" />
        </div>
      )}
      {detached.length === 0 ? null : (
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("groups.deleteImpactDetachedTitle")}</p>
          <DependencyList dependencies={detached} testId="group-delete-detached-list" />
        </div>
      )}
      {cascaded.length === 0 ? null : (
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("groups.deleteImpactCascadedTitle")}</p>
          <DependencyList dependencies={cascaded} testId="group-delete-cascaded-list" />
        </div>
      )}
      {blockers.length === 0 && detached.length === 0 && cascaded.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="group-delete-impact-clear">
          {t("groups.deleteImpactClear")}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("groups.deleteImpactAuditNote")}</p>
    </div>
  );
}
