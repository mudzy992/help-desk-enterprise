import { PrismaService } from '../../common/prisma/prisma.service';
import type { FormVersionRecord } from './service-forms.types';

export async function countTicketsForFormVersion(
  prisma: PrismaService,
  formVersionRef: string,
): Promise<number> {
  return prisma.ticket.count({
    where: { formVersionId: formVersionRef },
  });
}

export function isFormVersionImmutable(
  record: Pick<FormVersionRecord, 'status'>,
  ticketCount: number,
): boolean {
  return record.status !== 'DRAFT' || ticketCount > 0;
}
