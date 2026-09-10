import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from './load-service';
import { toServiceFormResponse } from './to-service-form-response';
import type { ServiceFormResponse } from './service-forms.types';

export async function getServiceForm(
  prisma: PrismaService,
  serviceId: string,
): Promise<ServiceFormResponse> {
  await loadService(prisma, serviceId);
  return toServiceFormResponse(prisma, serviceId);
}
