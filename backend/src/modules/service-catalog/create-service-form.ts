import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertServiceFormsEnabled } from './assert-service-forms-enabled';
import { isFormVersionUniqueConflict } from './is-form-version-unique-conflict';
import { loadService } from './load-service';
import { parseConfiguredFormSchema } from './parse-configured-form-schema';
import {
  recordServiceCatalogChange,
} from './record-service-catalog-change';
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
import { withServiceFormVersionMutationLock } from './with-service-form-activation-lock';

export async function createServiceForm(
  prisma: PrismaService,
  serviceId: string,
  input: CreateServiceFormInput,
  configuration: ServiceFormsConfiguration,
  context: CatalogMutationContext,
): Promise<FormVersionResponse> {
  assertServiceFormsEnabled(configuration);
  await loadService(prisma, serviceId);
  const schema = parseConfiguredFormSchema(input.schema, configuration);
  let created: Awaited<ReturnType<typeof createVersionOne>>;
  try {
    created = await prisma.$transaction(
      (transaction) =>
        withServiceFormVersionMutationLock(transaction, serviceId, async () => {
          await loadService(transaction as PrismaService, serviceId);
          const existing = await transaction.formVersion.count({
            where: { serviceId },
          });
          if (existing > 0) {
            throw new ServiceFormsError('FORM_ALREADY_EXISTS');
          }
          return createVersionOne(transaction, serviceId, schema, context);
        }),
      { isolationLevel: 'ReadCommitted' },
    );
  } catch (error) {
    if (isFormVersionUniqueConflict(error)) {
      throw new ServiceFormsError('FORM_ALREADY_EXISTS');
    }
    throw error;
  }
  return toFormVersionResponse(created, 0);
}

async function createVersionOne(
  transaction: Prisma.TransactionClient,
  serviceId: string,
  schema: CreateServiceFormInput['schema'],
  context: CatalogMutationContext,
) {
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
}
