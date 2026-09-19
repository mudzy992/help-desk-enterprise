import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketRecord } from './tickets.types';

export type TicketDisplayLabels = {
  readonly users: ReadonlyMap<string, string>;
  readonly groups: ReadonlyMap<string, string>;
  readonly formVersions: ReadonlyMap<string, number>;
};

type NamedGroupRow = { readonly id: string; readonly name: string };
type NamedUserRow = { readonly id: string; readonly displayName?: string };
type FormVersionRow = { readonly id: string; readonly version?: number };

function unique(values: readonly (string | null)[]): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => value !== null && value !== ''),
    ),
  ];
}

/**
 * Resolves the human-readable names of the people, group and form version a
 * ticket points at, in three batch queries for the whole result set.
 */
export async function loadTicketDisplayLabels(
  prisma: PrismaService,
  records: readonly Pick<
    TicketRecord,
    'requesterId' | 'assignedUserId' | 'assignedGroupId' | 'formVersionId'
  >[],
): Promise<TicketDisplayLabels> {
  const userIds = unique(
    records.flatMap((record) => [record.requesterId, record.assignedUserId]),
  );
  const groupIds = unique(records.map((record) => record.assignedGroupId));
  const formVersionIds = unique(records.map((record) => record.formVersionId));
  const [users, groups, formVersions] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve([] as NamedUserRow[])
      : (prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true },
        }) as Promise<NamedUserRow[]>),
    groupIds.length === 0
      ? Promise.resolve([] as NamedGroupRow[])
      : (prisma.group.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, name: true },
        }) as Promise<NamedGroupRow[]>),
    formVersionIds.length === 0
      ? Promise.resolve([] as FormVersionRow[])
      : (prisma.formVersion.findMany({
          where: { id: { in: formVersionIds } },
          select: { id: true, version: true },
        }) as Promise<FormVersionRow[]>),
  ]);
  return {
    users: new Map(
      users.flatMap((row) =>
        typeof row.displayName === 'string' && row.displayName.length > 0
          ? [[row.id, row.displayName] as const]
          : [],
      ),
    ),
    groups: new Map(groups.map((row) => [row.id, row.name])),
    formVersions: new Map(
      formVersions.flatMap((row) =>
        typeof row.version === 'number' ? [[row.id, row.version] as const] : [],
      ),
    ),
  };
}
