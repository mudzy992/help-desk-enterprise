import { PrismaService } from '../../../common/prisma/prisma.service';
import { ticketSystemEventActions } from '../collaboration.constants';

export async function findLatestRemoteRequestAt(
  prisma: PrismaService,
  ticketId: string,
): Promise<Date | null> {
  const latest = await prisma.ticketMessage.findFirst({
    where: {
      ticketId,
      type: 'SYSTEM_EVENT',
      body: ticketSystemEventActions.remoteRequested,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return latest?.createdAt ?? null;
}
