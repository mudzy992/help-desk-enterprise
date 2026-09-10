import { PrismaService } from '../../common/prisma/prisma.service';
import { countTicketsForFormVersion } from './is-form-version-immutable';
import { listFormVersionRecords } from './list-form-version-records';
import type { ServiceFormResponse } from './service-forms.types';
import { toFormVersionResponse } from './to-form-version-response';

export async function toServiceFormResponse(
  prisma: PrismaService,
  serviceId: string,
): Promise<ServiceFormResponse> {
  const records = await listFormVersionRecords(prisma, serviceId);
  const versions = [];
  for (const record of records) {
    versions.push(
      toFormVersionResponse(
        record,
        await countTicketsForFormVersion(prisma, record.id),
      ),
    );
  }
  const active = [...versions]
    .reverse()
    .find((version) => version.status === 'ACTIVE');
  return {
    serviceId,
    activeFormVersionRef: active?.formVersionRef ?? null,
    versions,
  };
}
