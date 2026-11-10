import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { parseConfiguredFormSchema } from '../service-catalog/parse-configured-form-schema';
import { recordServiceCatalogChange } from '../service-catalog/record-service-catalog-change';
import {
  serviceFormsChangeLogEntityType,
  serviceFormsChangeLogReasons,
} from '../service-catalog/service-forms.constants';
import type { ServiceFormsConfiguration } from '../service-catalog/service-forms.types';
import {
  installSeedConstants,
  installSeedFormSchema,
} from './install-seed.constants';

export type EnsuredInstallSeedFormVersion = {
  readonly formVersionRef: string;
  readonly created: boolean;
};

/// A ticket always stores a formVersionRef, so a requester-offered service is
/// unusable until one of its form versions is ACTIVE. The install seed owns
/// that guarantee for the service it seeds.
export async function ensureInstallSeedFormVersion(
  prisma: PrismaService,
  input: {
    readonly serviceId: string;
    readonly actorUserId: string;
    readonly forms: ServiceFormsConfiguration;
  },
): Promise<EnsuredInstallSeedFormVersion> {
  const active = await prisma.formVersion.findFirst({
    where: { serviceId: input.serviceId, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  if (active !== null) {
    return { formVersionRef: active.id, created: false };
  }
  const draft = await prisma.formVersion.findFirst({
    where: { serviceId: input.serviceId, status: 'DRAFT' },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  if (draft !== null) {
    return {
      formVersionRef: await activateSeedFormVersion(prisma, draft.id, input),
      created: false,
    };
  }
  const schema = parseConfiguredFormSchema(installSeedFormSchema, input.forms);
  const highest = await prisma.formVersion.findFirst({
    where: { serviceId: input.serviceId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const created = await prisma.formVersion.create({
    data: {
      serviceId: input.serviceId,
      version: (highest?.version ?? 0) + 1,
      schema: schema as Prisma.InputJsonValue,
      status: 'DRAFT',
    },
  });
  await recordServiceCatalogChange(prisma, {
    entityType: serviceFormsChangeLogEntityType,
    entityId: created.id,
    reason: serviceFormsChangeLogReasons.formCreate,
    diff: {
      after: {
        serviceId: input.serviceId,
        version: created.version,
        formVersionRef: created.id,
        source: installSeedConstants.changeLogReason,
      },
    },
    actorUserId: input.actorUserId,
  });
  return {
    formVersionRef: await activateSeedFormVersion(prisma, created.id, input),
    created: true,
  };
}

async function activateSeedFormVersion(
  prisma: PrismaService,
  formVersionId: string,
  input: {
    readonly serviceId: string;
    readonly actorUserId: string;
    readonly forms: ServiceFormsConfiguration;
  },
): Promise<string> {
  if (!input.forms.allowMultipleActiveVersions) {
    await prisma.formVersion.updateMany({
      where: {
        serviceId: input.serviceId,
        status: 'ACTIVE',
        id: { not: formVersionId },
      },
      data: { status: 'RETIRED' },
    });
  }
  const activated = await prisma.formVersion.update({
    where: { id: formVersionId },
    data: { status: 'ACTIVE' },
  });
  await recordServiceCatalogChange(prisma, {
    entityType: serviceFormsChangeLogEntityType,
    entityId: activated.id,
    reason: serviceFormsChangeLogReasons.formVersionActivate,
    diff: {
      formVersionRef: activated.id,
      version: activated.version,
      source: installSeedConstants.changeLogReason,
    },
    actorUserId: input.actorUserId,
  });
  return activated.id;
}
