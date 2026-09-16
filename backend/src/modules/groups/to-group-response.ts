import type {
  GroupListItemResponse,
  GroupMemberResponse,
  GroupResponse,
} from './groups.types';
import type { LoadedGroupRecord } from './load-group-record';

type GroupListRecord = {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly organizationalUnitId: string;
  readonly isFallback: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly organizationalUnit: { readonly ouPath: string };
  readonly _count: { readonly members: number };
};

export function toGroupListItemResponse(
  group: GroupListRecord,
): GroupListItemResponse {
  return {
    id: group.id,
    name: group.name,
    key: group.key,
    organizationalUnitId: group.organizationalUnitId,
    organizationalUnitPath: group.organizationalUnit.ouPath,
    isFallback: group.isFallback,
    memberCount: group._count.members,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

export function toGroupResponse(group: LoadedGroupRecord): GroupResponse {
  return {
    ...toGroupListItemResponse(group),
    members: group.members.map(toGroupMemberResponse),
  };
}

function toGroupMemberResponse(
  member: LoadedGroupRecord['members'][number],
): GroupMemberResponse {
  return {
    id: member.id,
    userId: member.userId,
    displayName: member.user.displayName,
    email: member.user.email,
    createdAt: member.createdAt.toISOString(),
  };
}
