import { PrismaService } from '../../common/prisma/prisma.service';
import { countTicketsForFormVersion } from './is-form-version-immutable';
import { loadFormVersionForService } from './load-form-version';
import {
  recordServiceCatalogChange,
} from './record-service-catalog-change';
import { assertServiceFormsEnabled } from './assert-service-forms-enabled';
import {
  serviceFormsChangeLogEntityType,
  serviceFormsChangeLogReasons,
} from './service-forms.constants';
import { ServiceFormsError } from './service-forms.error';
import type { CatalogMutationContext } from './service-catalog.types';
import type {
  FormVersionResponse,
  ServiceFormsConfiguration,
} from './service-forms.types';
import { toFormVersionResponse } from './to-form-version-response';

export async function activateServiceFormVersion(
  prisma: PrismaService,
  serviceId: string,
  formVersionRef: string,
  configuration: ServiceFormsConfiguration,
  context: CatalogMutationContext,
): Promise<FormVersionResponse> {
  assertServiceFormsEnabled(configuration);
  const current = await loadFormVersionForService(prisma, serviceId, formVersionRef);
  if (current.status !== 'DRAFT') {
    throw new ServiceFormsError('FORM_VERSION_NOT_DRAFT');
  }
  const activated = await prisma.$transaction(async (transaction) => {
    if (!configuration.allowMultipleActiveVersions) {
      await transaction.formVersion.updateMany({
        where: {
          serviceId,
          status: 'ACTIVE',
          id: { not: current.id },
        },
        data: { status: 'RETIRED' },
      });
    }
    const version = await transaction.formVersion.update({
      where: { id: current.id },
      data: { status: 'ACTIVE' },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceFormsChangeLogEntityType,
      entityId: version.id,
      reason: serviceFormsChangeLogReasons.formVersionActivate,
      diff: { formVersionRef: version.id, version: version.version },
      actorUserId: context.actorUserId,
    });
    return version;
  });
  return toFormVersionResponse(
    activated,
    await countTicketsForFormVersion(prisma, activated.id),
  );
}
