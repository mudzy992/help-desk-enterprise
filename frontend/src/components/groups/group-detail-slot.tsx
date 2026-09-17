import { GroupMembersSection } from "@/components/groups/group-members-section";
import { GroupMutationForm } from "@/components/groups/group-mutation-form";
import { Card } from "@/components/ui/card";
import type { DirectoryUser } from "@/lib/directory/use-directory";
import type { OriginUnitOption } from "@/lib/tickets/ticket-display";
import type {
  GroupListItemResponse,
  GroupResponse,
} from "@/services/groups-api";

interface GroupDetailSlotProperties {
  readonly loadingLabel: string;
  readonly originUnits: readonly OriginUnitOption[];
  readonly users: readonly DirectoryUser[];
  readonly canWrite: boolean;
  readonly editingGroup: GroupListItemResponse | undefined;
  readonly expandedGroup: GroupResponse | null;
  readonly isPending: boolean;
  readonly onSaveEdit: (input: {
    readonly name: string;
    readonly organizationalUnitId: string;
    readonly isFallback: boolean;
  }) => void;
  readonly onCancelEdit: () => void;
  readonly onMembersChanged: (group: GroupResponse) => void;
}

export function GroupDetailSlot({
  loadingLabel,
  originUnits,
  users,
  canWrite,
  editingGroup,
  expandedGroup,
  isPending,
  onSaveEdit,
  onCancelEdit,
  onMembersChanged,
}: GroupDetailSlotProperties) {
  return (
    <Card className="px-4 py-3">
      {editingGroup !== undefined ? (
        <GroupMutationForm
          originUnits={originUnits}
          initial={editingGroup}
          pending={isPending}
          onSubmit={onSaveEdit}
          onCancel={onCancelEdit}
        />
      ) : expandedGroup !== null ? (
        <GroupMembersSection
          group={expandedGroup}
          users={users}
          canWrite={canWrite}
          onChanged={onMembersChanged}
        />
      ) : (
        <p className="text-[12px] text-muted-foreground">{loadingLabel}</p>
      )}
    </Card>
  );
}
