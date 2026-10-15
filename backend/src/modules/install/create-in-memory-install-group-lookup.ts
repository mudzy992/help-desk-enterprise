import type { InMemoryOrganizationalUnit } from '../organizational-units/create-in-memory-organizational-unit-prisma';
import type { InMemoryInstallGroupMember } from './create-in-memory-install-group-member-delegate';
import type { InMemoryInstallSeedGroup } from './create-in-memory-install-seed-group-delegate';

export type InMemoryInstallUserLookup = (
  userId: string,
) => { readonly displayName: string; readonly email: string } | undefined;

const relationKeys = ['organizationalUnit', 'members', '_count', 'organizationalUnitId'] as const;

/**
 * `addGroupMember` (reused by the F0.6 seed step) returns a full group record
 * (`load-group-record.ts`), so the install seed harness has to answer that
 * query too — the plain group delegate only knows the flat fields.
 */
export function createInMemoryInstallGroupLookup(input: {
  readonly groups: Map<string, InMemoryInstallSeedGroup>;
  readonly units: Map<string, InMemoryOrganizationalUnit>;
  readonly readMembers: (groupId: string) => readonly InMemoryInstallGroupMember[];
  readonly readUser: InMemoryInstallUserLookup;
  readonly readGroup: (groupId: string) => InMemoryInstallSeedGroup | undefined;
}) {
  return async ({
    where,
    select,
  }: {
    where: { id?: string; key?: string };
    select?: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null> => {
    const group =
      where.id !== undefined
        ? input.readGroup(where.id)
        : [...input.groups.values()].find((entry) => entry.key === where.key);
    if (group === undefined) {
      return null;
    }
    if (select === undefined || !relationKeys.some((key) => key in select)) {
      return group;
    }
    const extended: Record<string, unknown> = {
      id: group.id,
      name: group.name,
      key: group.key,
      organizationalUnitId: group.organizationalUnitId,
      isFallback: group.isFallback,
      isProblemGroup: group.isProblemGroup ?? false,
      isCabGroup: group.isCabGroup ?? false,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
    if (select.organizationalUnit !== undefined) {
      extended.organizationalUnit = {
        ouPath: input.units.get(group.organizationalUnitId)?.ouPath ?? '',
      };
    }
    if (select.members !== undefined) {
      extended.members = input.readMembers(group.id).map((member) => ({
        id: member.id,
        userId: member.userId,
        createdAt: member.createdAt,
        user: input.readUser(member.userId) ?? { displayName: '', email: '' },
      }));
    }
    if (select._count !== undefined) {
      extended._count = {
        members: input.readMembers(group.id).length,
      };
    }
    return extended;
  };
}
