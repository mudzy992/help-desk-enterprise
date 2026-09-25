import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketTimeLogRecord } from '../collaboration.types';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import { timeTrackingConstants } from './time-tracking.constants';

/**
 * T3: "I am still working". One primary-key update; calls closer together
 * than the minimum interval are accepted and ignored, so a busy tab (or
 * several) cannot turn heartbeats into write load. A stopped timer answers
 * TIME_LOG_NOT_ACTIVE, which is how a browser learns the sweep closed it.
 *
 * Only the owner may heartbeat; ticket access was granted when the timer
 * started and the timer id is not guessable, so no ticket reload happens here.
 */
export async function heartbeatTicketTimeLog(
  prisma: PrismaService,
  ticketId: string,
  timeLogId: string,
  context: TicketMutationContext,
  now: Date = new Date(),
): Promise<void> {
  const current = (await prisma.ticketTimeLog.findFirst({
    where: { id: timeLogId, ticketId, userId: context.actorUserId },
  })) as TicketTimeLogRecord | null;
  if (current === null || (current.deletedAt ?? null) !== null) {
    throw new TicketsError('TIME_LOG_NOT_FOUND');
  }
  if (current.endedAt !== null) {
    throw new TicketsError('TIME_LOG_NOT_ACTIVE');
  }
  const last = current.lastHeartbeatAt?.getTime() ?? 0;
  if (now.getTime() - last < timeTrackingConstants.heartbeatMinimumIntervalSeconds * 1000) {
    return;
  }
  await prisma.ticketTimeLog.update({
    where: { id: timeLogId },
    data: { lastHeartbeatAt: now },
  });
}
