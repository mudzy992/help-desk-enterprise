export type InMemoryInstallGroupMember = {
  readonly id: string;
  readonly groupId: string;
  readonly userId: string;
  readonly createdAt: Date;
};

type GroupMemberWhere = {
  readonly groupId?: string;
  readonly userId?: string;
  readonly user?: { readonly isActive?: boolean };
};

/**
 * Install wizard v2 (F0.6): the seed now adds the founder to the fallback group
 * through `addGroupMember`, so the install seed harness needs the membership
 * table the groups module reads and writes.
 */
export function createInMemoryInstallGroupMemberStore(input: {
  readonly readUserActive: (userId: string) => boolean | undefined;
  readonly nextId: () => string;
  readonly now: () => Date;
}) {
  const members: InMemoryInstallGroupMember[] = [];

  const matches = (member: InMemoryInstallGroupMember, where?: GroupMemberWhere) => {
    if (where === undefined) {
      return true;
    }
    if (where.groupId !== undefined && member.groupId !== where.groupId) {
      return false;
    }
    if (where.userId !== undefined && member.userId !== where.userId) {
      return false;
    }
    if (where.user?.isActive !== undefined) {
      return input.readUserActive(member.userId) === where.user.isActive;
    }
    return true;
  };

  return {
    members,
    prisma: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { groupId_userId: { groupId: string; userId: string } };
        select?: Record<string, boolean>;
      }) => {
        const member = members.find(
          (entry) =>
            entry.groupId === where.groupId_userId.groupId &&
            entry.userId === where.groupId_userId.userId,
        );
        return member === undefined ? null : pick(member, select);
      },
      findMany: async ({
        where,
        orderBy,
      }: {
        where?: GroupMemberWhere;
        orderBy?: Record<string, 'asc' | 'desc'>;
      } = {}) => {
        const found = members.filter((member) => matches(member, where));
        if (orderBy?.createdAt === 'desc') {
          return [...found].reverse();
        }
        return found;
      },
      count: async ({ where }: { where?: GroupMemberWhere } = {}) =>
        members.filter((member) => matches(member, where)).length,
      create: async ({
        data,
      }: {
        data: { groupId: string; userId: string };
      }) => {
        const created: InMemoryInstallGroupMember = {
          id: input.nextId(),
          groupId: data.groupId,
          userId: data.userId,
          createdAt: input.now(),
        };
        members.push(created);
        return created;
      },
    },
  };
}

function pick(
  member: InMemoryInstallGroupMember,
  select?: Record<string, boolean>,
): InMemoryInstallGroupMember | Record<string, unknown> {
  if (select === undefined) {
    return member;
  }
  const picked: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) {
      picked[key] = member[key as keyof InMemoryInstallGroupMember];
    }
  }
  return picked;
}
