import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  countTicketsForFormVersion,
  isFormVersionImmutable,
} from './is-form-version-immutable';
import { loadFormVersionForService } from './load-form-version';
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
import type { CatalogMutationContext } from './service-catalog.types';
import type {
  FormVersionResponse,
  ServiceFormsConfiguration,
  UpdateServiceFormVersionInput,
} from './service-forms.types';
import { toFormVersionResponse } from './to-form-version-response';

export async function updateServiceFormVersion(
  prisma: PrismaService,
  serviceId: string,
  formVersionRef: string,
  input: UpdateServiceFormVersionInput,
  configuration: ServiceFormsConfiguration,
  context: CatalogMutationContext,
): Promise<FormVersionResponse> {
  assertServiceFormsEnabled(configuration);
  const current = await loadFormVersionForService(prisma, serviceId, formVersionRef);
  const ticketCount = await countTicketsForFormVersion(prisma, current.id);
  if (isFormVersionImmutable(current, ticketCount)) {
    throw new ServiceFormsError('FORM_VERSION_IMMUTABLE');
  }
  const schema = parseConfiguredFormSchema(input.schema, configuration);
  const updated = await prisma.$transaction(async (transaction) => {
    const version = await transaction.formVersion.update({
      where: { id: current.id },
      data: { schema: schema as Prisma.InputJsonValue },
    });
    await recordServiceCatalogChange(transaction as PrismaService, {
      entityType: serviceFormsChangeLogEntityType,
      entityId: version.id,
      reason: serviceFormsChangeLogReasons.formVersionUpdate,
      diff: { formVersionRef: version.id, version: version.version },
      actorUserId: context.actorUserId,
    });
    return version;
  });
  return toFormVersionResponse(updated, ticketCount);
}
