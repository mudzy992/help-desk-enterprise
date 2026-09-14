import { PrismaService } from '../../../common/prisma/prisma.service';
import { ticketSystemEventActions } from '../collaboration.constants';

export async function findLatestRemoteRequestAt(
  prisma: PrismaService,
  ticketId: string,
): Promise<Date | null> {
  const records = await prisma.ticketMessage.findMany({
    where: { ticketId, type: 'SYSTEM_EVENT' },
    orderBy: { createdAt: 'desc' },
  });
  const latest = records.find(
    (record) => record.body === ticketSystemEventActions.remoteRequested,
  );
  return latest?.createdAt ?? null;
}
