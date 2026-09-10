import { PrismaService } from '../../common/prisma/prisma.service';
import { assertServiceLifecycleTransition } from './assert-service-lifecycle-transition';
import { loadService } from './load-service';
import {
  recordServiceCatalogChange,
  serviceChangeLogEntityType,
} from './record-service-catalog-change';
import type {
  CatalogMutationContext,
  ServiceLifecycleConfiguration,
  ServiceResponse,
  TransitionServiceLifecycleInput,
} from './service-catalog.types';
import { toServiceResponse } from './to-service-response';

export async function transitionServiceLifecycle(
  prisma: PrismaService,
  serviceId: string,
  input: TransitionServiceLifecycleInput,
  configuration: ServiceLifecycleConfiguration,
  context: CatalogMutationContext,
): Promise<ServiceResponse> {
  const current = await loadService(prisma, serviceId);
  assertServiceLifecycleTransition({
    from: current.lifecycle,
    to: input.lifecycle,
    configuration,
  });
  const updated = await prisma.$transaction(async (transaction) => {
    const service = await transaction.service.update({
      where: { id: serviceId },
      data: { lifecycle: input.lifecycle },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceChangeLogEntityType(),
      entityId: service.id,
      reason: 'lifecycle_transition',
      diff: {
        before: { lifecycle: current.lifecycle, id: current.id, slug: current.slug },
        after: { lifecycle: service.lifecycle, id: service.id, slug: service.slug },
      },
      actorUserId: context.actorUserId,
    });
    return service;
  });
  return toServiceResponse(updated);
}
