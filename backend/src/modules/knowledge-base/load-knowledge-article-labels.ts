import { PrismaService } from '../../common/prisma/prisma.service';
import type { KnowledgeArticleRecord } from './knowledge-base.types';

export type KnowledgeArticleLabels = {
  readonly ownerName: string | null;
  readonly ownerGroupName: string | null;
  readonly serviceName: string | null;
};

type Named = { readonly id: string; readonly name?: string };
type NamedUser = { readonly id: string; readonly displayName?: string };

function unique(values: readonly (string | null)[]): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => value !== null && value !== ''),
    ),
  ];
}

/**
 * Names for the owner, owner group and service of the given articles, in
 * three batch queries, so screens shown to any role never fall back to ids.
 */
export async function loadKnowledgeArticleLabels(
  prisma: PrismaService,
  records: readonly Pick<
    KnowledgeArticleRecord,
    'id' | 'ownerUserId' | 'ownerGroupId' | 'serviceId'
  >[],
): Promise<ReadonlyMap<string, KnowledgeArticleLabels>> {
  const userIds = unique(records.map((record) => record.ownerUserId));
  const groupIds = unique(records.map((record) => record.ownerGroupId));
  const serviceIds = unique(records.map((record) => record.serviceId));
  const [users, groups, services] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve([] as NamedUser[])
      : (prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true },
        }) as Promise<NamedUser[]>),
    groupIds.length === 0
      ? Promise.resolve([] as Named[])
      : (prisma.group.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, name: true },
        }) as Promise<Named[]>),
    serviceIds.length === 0
      ? Promise.resolve([] as Named[])
      : (prisma.service.findMany({
          where: { id: { in: serviceIds } },
          select: { id: true, name: true },
        }) as Promise<Named[]>),
  ]);
  const userNames = new Map(users.map((row) => [row.id, row.displayName ?? null]));
  const groupNames = new Map(groups.map((row) => [row.id, row.name ?? null]));
  const serviceNames = new Map(services.map((row) => [row.id, row.name ?? null]));
  return new Map(
    records.map((record) => [
      record.id,
      {
        ownerName:
          record.ownerUserId === null
            ? null
            : (userNames.get(record.ownerUserId) ?? null),
        ownerGroupName:
          record.ownerGroupId === null
            ? null
            : (groupNames.get(record.ownerGroupId) ?? null),
        serviceName: serviceNames.get(record.serviceId) ?? null,
      },
    ]),
  );
}
