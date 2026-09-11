import { PrismaService } from '../../../common/prisma/prisma.service';
import { buildChangeLogDiff } from '../../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../../change-log/change-log.constants';
import { recordChangeLog } from '../../change-log/record-change-log';
import type { ChangeLogPrismaClient } from '../../change-log/change-log.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import {
  confidentialAuditActions,
  confidentialChangeLogReasons,
} from './confidential.constants';
import type { TicketConfidentialConfiguration } from './confidential.types';

export async function recordConfidentialAccessAudit(
  prisma: PrismaService,
  input: {
    readonly ticketId: string;
    readonly actorUserId: string;
    readonly result: 'allowed' | 'denied' | 'break_glass';
    readonly via?: string;
    readonly reason?: string;
    readonly configuration: TicketConfidentialConfiguration;
    readonly writeSystemEvent?: boolean;
    readonly messages?: TicketPersistedMessageSink;
  },
): Promise<void> {
  if (!input.configuration.auditViews && input.result === 'allowed') {
    return;
  }
  await recordChangeLog(prisma as unknown as ChangeLogPrismaClient, {
    entityType: changeLogEntityTypes.ticket,
    entityId: input.ticketId,
    reason: changelogReason(input),
    actorUserId: input.actorUserId,
    diff: buildChangeLogDiff({
      action:
        input.result === 'break_glass'
          ? changeLogActions.create
          : changeLogActions.update,
      resourceType: changeLogEntityTypes.ticket,
      resourceId: input.ticketId,
      before: {},
      after: {
        result: input.result,
        ...(input.via === undefined ? {} : { via: input.via }),
        ...(input.reason === undefined || input.reason.length === 0
          ? {}
          : { reason: input.reason }),
      },
    }),
  });
  if (input.writeSystemEvent === false) {
    return;
  }
  const event = await insertSystemTicketEvent(prisma, {
    ticketId: input.ticketId,
    action: systemAction(input.result),
    actorUserId: input.actorUserId,
  });
  input.messages?.push(event);
}

function changelogReason(input: {
  readonly result: 'allowed' | 'denied' | 'break_glass';
}): string {
  if (input.result === 'denied') {
    return confidentialChangeLogReasons.denied;
  }
  if (input.result === 'break_glass') {
    return confidentialChangeLogReasons.breakGlass;
  }
  return confidentialChangeLogReasons.viewed;
}

function systemAction(result: 'allowed' | 'denied' | 'break_glass'): string {
  if (result === 'denied') {
    return confidentialAuditActions.denied;
  }
  if (result === 'break_glass') {
    return confidentialAuditActions.breakGlass;
  }
  return confidentialAuditActions.viewed;
}
