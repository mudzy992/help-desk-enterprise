import { PrismaService } from '../../common/prisma/prisma.service';
import type { ChangeLogDiffPayload } from './change-log.types';

export type ChangeLogListEntry = {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly reason: string;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly createdAt: string;
  readonly diff: ChangeLogDiffPayload;
};

export type ChangeLogPage = {
  readonly items: readonly ChangeLogListEntry[];
  readonly total: number;
  readonly hasMore: boolean;
};

export async function listChangeLogPage(
  prisma: PrismaService,
  input: {
    readonly entityType: string;
    readonly entityId?: string;
    readonly entityIds?: readonly string[];
    readonly take: number;
    readonly cursor?: { readonly createdAt: Date; readonly id: string };
  },
): Promise<ChangeLogPage> {
  const baseWhere = {
    entityType: input.entityType,
    ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
    ...(input.entityIds === undefined ? {} : { entityId: { in: [...input.entityIds] } }),
  };
  const pageWhere = input.cursor === undefined
    ? baseWhere
    : {
        AND: [
          baseWhere,
          {
            OR: [
              { createdAt: { lt: input.cursor.createdAt } },
              { createdAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
            ],
          },
        ],
      };
  const [total, entries] = await Promise.all([
    prisma.changeLog.count({ where: baseWhere }),
    prisma.changeLog.findMany({
      where: pageWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.take + 1,
      include: { actor: { select: { displayName: true } } },
    }),
  ]);
  return {
    items: entries.slice(0, input.take).map(toChangeLogListEntry),
    total,
    hasMore: entries.length > input.take,
  };
}

export async function listChangeLogs(
  prisma: PrismaService,
  input: {
    readonly entityType: string;
    readonly entityId?: string;
  },
): Promise<readonly ChangeLogListEntry[]> {
  const entries = await prisma.changeLog.findMany({
    where: {
      entityType: input.entityType,
      ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      actor: {
        select: { displayName: true },
      },
    },
  });
  return entries.map(toChangeLogListEntry);
}

function toChangeLogListEntry(entry: {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly reason: string;
  readonly actorUserId: string | null;
  readonly actor: { readonly displayName: string } | null;
  readonly createdAt: Date;
  readonly diff: unknown;
}): ChangeLogListEntry {
  return {
    id: entry.id,
    entityType: entry.entityType,
    entityId: entry.entityId,
    reason: entry.reason,
    actorUserId: entry.actorUserId,
    actorDisplayName: entry.actor?.displayName ?? null,
    createdAt: entry.createdAt.toISOString(),
    diff: entry.diff as ChangeLogDiffPayload,
  };
}
