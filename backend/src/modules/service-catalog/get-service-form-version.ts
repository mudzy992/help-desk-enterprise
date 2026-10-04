import { PrismaService } from '../../common/prisma/prisma.service';
import { loadFormVersionForService } from './load-form-version';
import { loadService } from './load-service';
import { toFormVersionResponseWithTicketCount } from './to-form-version-response-with-ticket-count';
import { ServiceCatalogError } from './service-catalog.error';
import { isServiceLifecycleVisible } from './service-visible-lifecycles';
import type { FormVersionResponse } from './service-forms.types';

export async function getServiceFormVersion(
  prisma: PrismaService,
  serviceId: string,
  formVersionRef: string,
  /** Val 2 (M6/B2): role pozivaoca; `undefined` = interni poziv bez filtera. */
  roleKeys?: readonly string[],
): Promise<FormVersionResponse> {
  const service = await loadService(prisma, serviceId);
  if (!isServiceLifecycleVisible(service.lifecycle, roleKeys)) {
    throw new ServiceCatalogError('NOT_FOUND');
  }
  const record = await loadFormVersionForService(
    prisma,
    serviceId,
    formVersionRef,
  );
  return toFormVersionResponseWithTicketCount(prisma, record);
}
