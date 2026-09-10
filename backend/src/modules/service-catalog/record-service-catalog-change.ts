import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { serviceCatalogChangeLogEntityTypes } from './service-catalog.constants';

export async function recordServiceCatalogChange(
  prisma: PrismaService,
  input: {
    readonly entityType: string;
    readonly entityId: string;
    readonly reason: string;
    readonly diff: Prisma.InputJsonValue;
    readonly actorUserId: string | null;
  },
): Promise<void> {
  await prisma.changeLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason,
      diff: input.diff,
      actorUserId: input.actorUserId,
    },
  });
}

export function serviceChangeLogEntityType(): string {
  return serviceCatalogChangeLogEntityTypes.service;
}

export function serviceCategoryChangeLogEntityType(): string {
  return serviceCatalogChangeLogEntityTypes.serviceCategory;
}

export function serviceDowntimeWindowChangeLogEntityType(): string {
  return serviceCatalogChangeLogEntityTypes.serviceDowntimeWindow;
}
