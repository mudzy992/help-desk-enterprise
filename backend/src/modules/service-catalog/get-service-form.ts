import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from './load-service';
import { toServiceFormResponse } from './to-service-form-response';
import { ServiceCatalogError } from './service-catalog.error';
import { isServiceLifecycleVisible } from './service-visible-lifecycles';
import type { ServiceFormResponse } from './service-forms.types';

export async function getServiceForm(
  prisma: PrismaService,
  serviceId: string,
  /** Val 2 (M6/B2): role pozivaoca; `undefined` = interni poziv bez filtera. */
  roleKeys?: readonly string[],
  formsEnabled = true,
  requireVersionOnTicket = true,
): Promise<ServiceFormResponse> {
  const service = await loadService(prisma, serviceId);
  // Shema forme nacrta nije javna (RAW `:304`) — skriveno stanje se ponaša kao
  // nepostojeća usluga, da se postojanje ne može izvesti iz greške.
  if (!isServiceLifecycleVisible(service.lifecycle, roleKeys)) {
    throw new ServiceCatalogError('NOT_FOUND');
  }
  return toServiceFormResponse(
    prisma,
    serviceId,
    formsEnabled,
    requireVersionOnTicket,
  );
}
