import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { loadService } from './load-service';
import { parseConfiguredFormSchema } from './parse-configured-form-schema';
import {
  recordServiceCatalogChange,
} from './record-service-catalog-change';
import { assertServiceFormsEnabled } from './assert-service-forms-enabled';
import {
  serviceFormsChangeLogEntityType,
  serviceFormsChangeLogReasons,
} from './service-forms.constants';
import { ServiceFormsError } from './service-forms.error';
import type {
  CatalogMutationContext,
} from './service-catalog.types';
import type {
  CreateServiceFormInput,
  FormVersionResponse,
  ServiceFormsConfiguration,
} from './service-forms.types';
import { toFormVersionResponse } from './to-form-version-response';

export async function createServiceForm(
  prisma: PrismaService,
  serviceId: string,
  input: CreateServiceFormInput,
  configuration: ServiceFormsConfiguration,
  context: CatalogMutationContext,
): Promise<FormVersionResponse> {
  assertServiceFormsEnabled(configuration);
  await loadService(prisma, serviceId);
  const existing = await prisma.formVersion.count({ where: { serviceId } });
  if (existing > 0) {
    throw new ServiceFormsError('FORM_ALREADY_EXISTS');
  }
  const schema = parseConfiguredFormSchema(input.schema, configuration);
  const created = await prisma.$transaction(async (transaction) => {
    const version = await transaction.formVersion.create({
      data: {
        serviceId,
        version: 1,
        schema: schema as Prisma.InputJsonValue,
        status: 'DRAFT',
      },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceFormsChangeLogEntityType,
      entityId: version.id,
      reason: serviceFormsChangeLogReasons.formCreate,
      diff: { after: { serviceId, version: 1, formVersionRef: version.id } },
      actorUserId: context.actorUserId,
    });
    return version;
  });
  return toFormVersionResponse(created, 0);
}
