export type InMemoryGroupMember = {
  readonly id: string;
  readonly groupId: string;
  readonly userId: string;
};

export function createInMemoryGroupMemberDelegate(
  members: Map<string, InMemoryGroupMember>,
) {
  const matching = (where?: { groupId?: string; userId?: string }) =>
    [...members.values()].filter((member) => {
      if (where?.groupId !== undefined && member.groupId !== where.groupId) {
        return false;
      }
      return where?.userId === undefined || member.userId === where.userId;
    });
  return {
    findMany: async ({
      where,
      select,
    }: {
      where?: { groupId?: string; userId?: string };
      select?: Record<string, boolean>;
    } = {}) => matching(where).map((member) => pickMember(member, select)),
    findFirst: async ({
      where,
      select,
    }: {
      where?: { groupId?: string; userId?: string };
      select?: Record<string, boolean>;
    } = {}) => pickMember(matching(where)[0], select),
  };
}

function pickMember(
  member: InMemoryGroupMember | undefined,
  select?: Record<string, boolean>,
): InMemoryGroupMember | Record<string, unknown> | null {
  if (member === undefined) {
    return null;
  }
  if (select === undefined) {
    return member;
  }
  const picked: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) {
      picked[key] = member[key as keyof InMemoryGroupMember];
    }
  }
  return picked;
}

export function seedInMemoryGroupMember(
  members: Map<string, InMemoryGroupMember>,
  nextId: () => string,
  input: { readonly groupId: string; readonly userId: string },
): void {
  const id = nextId();
  members.set(id, { id, groupId: input.groupId, userId: input.userId });
}
