export type GroupMemberResponse = {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly email: string;
  readonly createdAt: string;
};

export type GroupResponse = {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly organizationalUnitId: string;
  readonly organizationalUnitPath: string;
  readonly isFallback: boolean;
  readonly memberCount: number;
  readonly members: readonly GroupMemberResponse[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type MyGroupResponse = {
  readonly id: string;
  readonly name: string;
  readonly organizationalUnit: {
    readonly id: string;
    readonly name: string;
    readonly path: string;
  };
  readonly memberCount: number;
  /** Priority group > service > global (decision D2); NONE if none applies. */
  readonly effectiveAutoAssign: import('../../generated/prisma/enums').AutoAssignStrategy;
  readonly isFallback: boolean;
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

export type CreateGroupInput = {
  readonly name: string;
  readonly organizationalUnitId: string;
  readonly isFallback?: boolean;
};

export type UpdateGroupInput = {
  readonly name?: string;
  readonly isFallback?: boolean;
};

export type ListGroupsQuery = {
  readonly organizationalUnitId?: string;
};
