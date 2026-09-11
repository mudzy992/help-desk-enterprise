import { buildChangeLogDiff } from '../change-log/build-change-log-diff';
import {
  changeLogActions,
  changeLogEntityTypes,
} from '../change-log/change-log.constants';
import type {
  ChangeLogAction,
  ChangeLogPrismaClient,
  JsonValue,
} from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toTicketResponse } from './to-ticket-response';
import { redactSensitiveText } from './redaction/redact-sensitive-text';
import type { TicketRedactionConfiguration } from './redaction/redaction.types';
import type { TicketRecord } from './tickets.types';

export async function recordTicketChange(
  prisma: PrismaService,
  input: {
    readonly action: ChangeLogAction;
    readonly reason: string;
    readonly before: TicketRecord | null;
    readonly after: TicketRecord;
    readonly actorUserId: string | null;
    readonly redaction?: TicketRedactionConfiguration;
  },
): Promise<void> {
  await recordChangeLog(prisma as unknown as ChangeLogPrismaClient, {
    entityType: changeLogEntityTypes.ticket,
    entityId: input.after.id,
    reason: input.reason,
    actorUserId: input.actorUserId,
    diff: buildChangeLogDiff({
      action: input.action,
      resourceType: changeLogEntityTypes.ticket,
      resourceId: input.after.id,
      before: toSnapshot(input.before, input.redaction),
      after: toSnapshot(input.after, input.redaction),
    }),
  });
}

function toSnapshot(
  record: TicketRecord | null,
  redaction?: TicketRedactionConfiguration,
): JsonValue {
  if (record === null) {
    return {};
  }
  const snapshot = toTicketResponse(record);
  if (redaction === undefined || !redaction.enabled) {
    return JSON.parse(JSON.stringify(snapshot)) as JsonValue;
  }
  return JSON.parse(
    JSON.stringify({
      ...snapshot,
      title: redactSensitiveText(snapshot.title, redaction),
      description: redactSensitiveText(snapshot.description, redaction),
    }),
  ) as JsonValue;
}

export { changeLogActions };
