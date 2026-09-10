import { PrismaService } from '../../common/prisma/prisma.service';
import { isServiceOfferedToRequesters } from './assert-service-lifecycle-transition';
import type { ListServicesInput, ServiceResponse } from './service-catalog.types';
import { toServiceResponse } from './to-service-response';

export async function listServices(
  prisma: PrismaService,
  input: ListServicesInput = {},
): Promise<readonly ServiceResponse[]> {
  const records = await prisma.service.findMany({
    where: {
      ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    },
    orderBy: [{ name: 'asc' }],
  });
  const mapped = records.map(toServiceResponse);
  if (input.offeredOnly !== true) {
    return mapped;
  }
  return mapped.filter((service) => isServiceOfferedToRequesters(service.lifecycle));
}
