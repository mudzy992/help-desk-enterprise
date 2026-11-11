import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from './load-service';
import {
  recordServiceCatalogChange,
  serviceChangeLogEntityType,
} from './record-service-catalog-change';
import { ServiceCatalogError } from './service-catalog.error';
import type { CatalogMutationContext } from './service-catalog.types';

export async function deleteService(
  prisma: PrismaService,
  serviceId: string,
  context: CatalogMutationContext,
): Promise<void> {
  const current = await loadService(prisma, serviceId);
  if (current.lifecycle !== 'DRAFT') {
    throw new ServiceCatalogError('NOT_DELETABLE');
  }
  const dependents = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      _count: {
        select: {
          tickets: true,
          formVersions: true,
          routingRules: true,
          userRoles: true,
        },
      },
    },
  });
  const counts = dependents?._count;
  if (
    counts !== undefined &&
    (counts.tickets > 0 ||
      counts.formVersions > 0 ||
      counts.routingRules > 0 ||
      counts.userRoles > 0)
  ) {
    throw new ServiceCatalogError('HAS_DEPENDENCIES');
  }
  await prisma.$transaction(async (transaction) => {
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceChangeLogEntityType(),
      entityId: current.id,
      reason: 'delete',
      diff: { before: { name: current.name, slug: current.slug } },
      actorUserId: context.actorUserId,
    });
    await transaction.service.delete({ where: { id: serviceId } });
  });
}
