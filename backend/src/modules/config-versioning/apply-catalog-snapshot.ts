import type {
  AutoAssignStrategy,
  DataClassification,
  FormVersionStatus,
  ServiceAvailability,
  ServiceLifecycle,
} from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import type { ConfigSnapshot } from './config-versioning.types';

export async function applyCatalogSnapshot(
  transaction: Prisma.TransactionClient,
  snapshot: ConfigSnapshot,
): Promise<void> {
  for (const service of snapshot.catalog.services) {
    const existing = await transaction.service.findUnique({
      where: { id: service.id },
      select: { id: true },
    });
    if (existing === null) {
      continue;
    }
    await transaction.service.update({
      where: { id: service.id },
      data: {
        name: service.name,
        slug: service.slug,
        categoryId: service.categoryId,
        lifecycle: service.lifecycle as ServiceLifecycle,
        availability: service.availability as ServiceAvailability,
        classification: service.classification as DataClassification,
        requiresApproval: service.requiresApproval,
        isConfidentialDefault: service.isConfidentialDefault,
        autoAssignStrategy: service.autoAssignStrategy as AutoAssignStrategy,
        slaProfileId: service.slaProfileId,
        policyPackId: service.policyPackId,
      },
    });
  }
  for (const form of snapshot.forms.versions) {
    const existing = await transaction.formVersion.findUnique({
      where: { id: form.id },
      select: { id: true },
    });
    if (existing === null) {
      continue;
    }
    await transaction.formVersion.update({
      where: { id: form.id },
      data: {
        schema: form.schema as Prisma.InputJsonValue,
        status: form.status as FormVersionStatus,
      },
    });
  }
}
