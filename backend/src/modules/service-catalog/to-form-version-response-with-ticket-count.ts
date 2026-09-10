import { PrismaService } from '../../common/prisma/prisma.service';
import { countTicketsForFormVersion } from './is-form-version-immutable';
import type { FormVersionRecord, FormVersionResponse } from './service-forms.types';
import { toFormVersionResponse } from './to-form-version-response';

export async function toFormVersionResponseWithTicketCount(
  prisma: PrismaService,
  record: FormVersionRecord,
): Promise<FormVersionResponse> {
  return toFormVersionResponse(
    record,
    await countTicketsForFormVersion(prisma, record.id),
  );
}
