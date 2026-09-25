import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type {
  TicketMessageRecord,
  TicketTimeLogRecord,
  TicketTimeLogResponse,
} from './collaboration.types';
import { TicketsError } from './tickets.error';
import { toTicketTimeLogResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';
import { closeTimeLog } from './time-tracking/close-time-log';
import { loadTimeTrackingTicket } from './time-tracking/load-time-tracking-ticket';
import { parseInstant } from './time-tracking/time-log-guards';
import {
  defaultTimeTrackingConfiguration,
  timeTrackingConstants,
} from './time-tracking/time-tracking.constants';
import type { TimeTrackingConfiguration } from './time-tracking/time-tracking.types';

export type StopTicketTimeLogOptions = {
  /** T3: the browser pauses an idle timer at the last moment of activity. */
  readonly reason?: 'MANUAL' | 'AUTO_IDLE';
  readonly endedAt?: string;
  readonly configuration?: TimeTrackingConfiguration;
};

/**
 * Stops a running segment. Only a stop for inactivity may carry its own end,
 * and that end must lie between the start and now and not before the last
 * heartbeat the same client confirmed (minus a small clock skew), so a client
 * can drop idle time but never erase time it reported as active (T3).
 */
export async function stopTicketTimeLog(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  timeLogId: string,
  context: TicketMutationContext,
  now: Date = new Date(),
  options: StopTicketTimeLogOptions = {},
): Promise<{
  timeLog: TicketTimeLogResponse;
  messages: readonly TicketMessageRecord[];
}> {
  const configuration = options.configuration ?? defaultTimeTrackingConfiguration;
  const { authContext } = await loadTimeTrackingTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const current = (await prisma.ticketTimeLog.findFirst({
    where: { id: timeLogId, ticketId },
  })) as TicketTimeLogRecord | null;
  if (current === null || (current.deletedAt ?? null) !== null) {
    throw new TicketsError('TIME_LOG_NOT_FOUND');
  }
  if (current.endedAt !== null) {
    throw new TicketsError('TIME_LOG_NOT_ACTIVE');
  }
  if (current.userId !== context.actorUserId && !authContext.isSuperAdmin) {
    throw new TicketsError('FORBIDDEN');
  }
  const reason = options.reason ?? 'MANUAL';
  const endedAt =
    reason === 'AUTO_IDLE' && options.endedAt !== undefined
      ? validateIdleEnd(current, parseInstant(options.endedAt), now)
      : now;
  const messages: TicketMessageRecord[] = [];
  const updated = await prisma.$transaction((transaction) =>
    closeTimeLog(transaction as PrismaService, {
      record: current,
      endedAt,
      reason,
      actorUserId: context.actorUserId,
      maxSessionHours: configuration.maxSessionHours,
      messages,
    }),
  );
  return { timeLog: toTicketTimeLogResponse(updated), messages };
}

export function validateIdleEnd(
  record: Pick<TicketTimeLogRecord, 'startedAt' | 'lastHeartbeatAt'>,
  endedAt: Date,
  now: Date,
): Date {
  const floor = record.lastHeartbeatAt
    ? record.lastHeartbeatAt.getTime() - timeTrackingConstants.heartbeatClockSkewSeconds * 1000
    : record.startedAt.getTime();
  if (
    endedAt.getTime() < record.startedAt.getTime() ||
    endedAt.getTime() > now.getTime() ||
    endedAt.getTime() < floor
  ) {
    throw new TicketsError('TIME_LOG_ENDED_AT_INVALID');
  }
  return endedAt;
}
