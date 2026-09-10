import { PrismaService } from '../../common/prisma/prisma.service';
import { loadFormVersionForService } from './load-form-version';
import { toFormVersionResponseWithTicketCount } from './to-form-version-response-with-ticket-count';
import type { FormVersionResponse } from './service-forms.types';

export async function getServiceFormVersion(
  prisma: PrismaService,
  serviceId: string,
  formVersionRef: string,
): Promise<FormVersionResponse> {
  const record = await loadFormVersionForService(
    prisma,
    serviceId,
    formVersionRef,
  );
  return toFormVersionResponseWithTicketCount(prisma, record);
}
