import { PrismaService } from '../../common/prisma/prisma.service';
import type { FormVersionRecord } from './service-forms.types';

export async function listFormVersionRecords(
  prisma: PrismaService,
  serviceId: string,
): Promise<readonly FormVersionRecord[]> {
  return prisma.formVersion.findMany({
    where: { serviceId },
    orderBy: { version: 'asc' },
  });
}

export async function loadLatestFormVersionNumber(
  prisma: PrismaService,
  serviceId: string,
): Promise<number> {
  const latest = await prisma.formVersion.findFirst({
    where: { serviceId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return latest?.version ?? 0;
}
