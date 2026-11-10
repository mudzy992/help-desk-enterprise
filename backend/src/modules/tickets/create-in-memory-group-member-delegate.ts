export type InMemoryGroupMember = {
  readonly id: string;
  readonly groupId: string;
  readonly userId: string;
};

type GroupMemberWhere = {
  readonly groupId?: string | { readonly in: readonly string[] };
  readonly userId?: string;
};

export function createInMemoryGroupMemberDelegate(
  members: Map<string, InMemoryGroupMember>,
) {
  const matching = (where?: GroupMemberWhere) =>
    [...members.values()].filter((member) => {
      if (where?.groupId !== undefined) {
        const expected = where.groupId;
        const matches =
          typeof expected === 'string'
            ? member.groupId === expected
            : expected.in.includes(member.groupId);
        if (!matches) {
          return false;
        }
      }
      return where?.userId === undefined || member.userId === where.userId;
    });
  return {
    findMany: async ({
      where,
      select,
    }: {
      where?: GroupMemberWhere;
      select?: Record<string, boolean>;
    } = {}) => matching(where).map((member) => pickMember(member, select)),
    findFirst: async ({
      where,
      select,
    }: {
      where?: GroupMemberWhere;
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
