import { apiRequest } from "@/services/api";

export type GroupMemberResponse = {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly createdAt: string;
};

export type GroupListItemResponse = {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly organizationalUnitId: string;
  readonly organizationalUnitPath: string;
  readonly isFallback: boolean;
  readonly memberCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type GroupResponse = GroupListItemResponse & {
  readonly members: readonly GroupMemberResponse[];
};

export type CreateGroupInput = {
  readonly name: string;
  readonly organizationalUnitId: string;
  readonly isFallback?: boolean;
};

export type UpdateGroupInput = {
  readonly name?: string;
  readonly isFallback?: boolean;
};

export function listGroups(
  organizationalUnitId?: string,
): Promise<readonly GroupListItemResponse[]> {
  const search =
    organizationalUnitId === undefined
      ? ""
      : `?${new URLSearchParams({ organizationalUnitId }).toString()}`;
  return apiRequest(`/groups${search}`);
}

export function getGroup(groupId: string): Promise<GroupResponse> {
  return apiRequest(`/groups/${groupId}`);
}

export function createGroup(input: CreateGroupInput): Promise<GroupResponse> {
  return apiRequest("/groups", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateGroup(
  groupId: string,
  input: UpdateGroupInput,
): Promise<GroupResponse> {
  return apiRequest(`/groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteGroup(groupId: string): Promise<void> {
  return apiRequest(`/groups/${groupId}`, { method: "DELETE" });
}

export function addGroupMember(
  groupId: string,
  userId: string,
): Promise<GroupResponse> {
  return apiRequest(`/groups/${groupId}/members/${userId}`, { method: "POST" });
}

export function removeGroupMember(
  groupId: string,
  userId: string,
): Promise<GroupResponse> {
  return apiRequest(`/groups/${groupId}/members/${userId}`, {
    method: "DELETE",
  });
}
