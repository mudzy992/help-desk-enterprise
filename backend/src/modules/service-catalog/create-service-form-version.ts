import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from './load-service';
import { loadLatestFormVersionNumber } from './list-form-version-records';
import { parseConfiguredFormSchema } from './parse-configured-form-schema';
import {
  recordServiceCatalogChange,
} from './record-service-catalog-change';
import { assertFormVersioningEnabled } from './assert-service-forms-enabled';
import {
  serviceFormsChangeLogEntityType,
  serviceFormsChangeLogReasons,
} from './service-forms.constants';
import { ServiceFormsError } from './service-forms.error';
import type { CatalogMutationContext } from './service-catalog.types';
import type {
  CreateServiceFormVersionInput,
  FormVersionResponse,
  ServiceFormsConfiguration,
} from './service-forms.types';
import { toFormVersionResponse } from './to-form-version-response';

export async function createServiceFormVersion(
  prisma: PrismaService,
  serviceId: string,
  input: CreateServiceFormVersionInput,
  configuration: ServiceFormsConfiguration,
  context: CatalogMutationContext,
): Promise<FormVersionResponse> {
  assertFormVersioningEnabled(configuration);
  await loadService(prisma, serviceId);
  const latestVersion = await loadLatestFormVersionNumber(prisma, serviceId);
  if (latestVersion === 0) {
    throw new ServiceFormsError('FORM_NOT_FOUND');
  }
  const schema = parseConfiguredFormSchema(input.schema, configuration);
  const created = await prisma.$transaction(async (transaction) => {
    const version = await transaction.formVersion.create({
      data: {
        serviceId,
        version: latestVersion + 1,
        schema: schema as Prisma.InputJsonValue,
        status: 'DRAFT',
      },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceFormsChangeLogEntityType,
      entityId: version.id,
      reason: serviceFormsChangeLogReasons.formVersionCreate,
      diff: {
        after: {
          serviceId,
          version: version.version,
          formVersionRef: version.id,
        },
      },
      actorUserId: context.actorUserId,
    });
    return version;
  });
  return toFormVersionResponse(created, 0);
}
