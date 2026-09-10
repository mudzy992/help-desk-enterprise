import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from './load-service';
import type { ServiceResponse } from './service-catalog.types';
import { toServiceResponse } from './to-service-response';

export async function getService(
  prisma: PrismaService,
  serviceId: string,
): Promise<ServiceResponse> {
  const record = await loadService(prisma, serviceId);
  return toServiceResponse(record);
}
