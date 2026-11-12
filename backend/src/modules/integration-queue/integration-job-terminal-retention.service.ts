import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IntegrationJobStatus } from '../../generated/prisma/enums';
import { integrationRetentionLegalHoldLockKey } from '../privacy/legal-hold/integration-retention-hold-lock';
import { terminalJobPayloadRedactedMarker } from './integration-queue.constants';

export const terminalJobPayloadRetentionDays = 30;
export const terminalJobMetadataRetentionDays = 90;
export const terminalJobRetentionBatchSize = 100;
const dayMs = 24 * 60 * 60 * 1000;
const terminalStatuses = [IntegrationJobStatus.COMPLETED, IntegrationJobStatus.PUBLISHED_BEST_EFFORT, IntegrationJobStatus.SKIPPED];

type RetentionResult = { readonly held: boolean; readonly redacted: number; readonly deleted: number };

@Injectable()
export class IntegrationJobTerminalRetentionService {
  private readonly logger = new Logger(IntegrationJobTerminalRetentionService.name);
  constructor(private readonly prisma: PrismaService) {}

  async sweep(now = new Date()): Promise<RetentionResult> {
    const redactBefore = new Date(now.getTime() - terminalJobPayloadRetentionDays * dayMs);
    const deleteBefore = new Date(now.getTime() - terminalJobMetadataRetentionDays * dayMs);
    const result = await this.prisma.$transaction(async (tx): Promise<RetentionResult> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${integrationRetentionLegalHoldLockKey})`;
      // Fail closed: any lookup error aborts the transaction before mutations.
      const [heldTicket, heldUser] = await Promise.all([
        tx.ticket.findFirst({ where: { legalHoldAt: { not: null } }, select: { id: true } }),
        tx.user.findFirst({ where: { legalHoldAt: { not: null } }, select: { id: true } }),
      ]);
      if (heldTicket !== null || heldUser !== null) return { held: true, redacted: 0, deleted: 0 };

      const deletable = {
        status: { in: terminalStatuses },
        lastError: terminalJobPayloadRedactedMarker,
        updatedAt: { lt: deleteBefore },
      };
      const toDelete = await tx.integrationJob.findMany({
        where: deletable, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: terminalJobRetentionBatchSize, select: { id: true, version: true },
      });
      const deleted = toDelete.length === 0 ? 0 : (await tx.integrationJob.deleteMany({
        where: { ...deletable, AND: [{ OR: toDelete.map(({ id, version }) => ({ id, version })) }] },
      })).count;

      const redactable = {
        status: { in: terminalStatuses },
        OR: [
          { lastError: null },
          { status: IntegrationJobStatus.SKIPPED, lastError: { in: ['TEAMS_DELIVERY_SKIPPED', 'TEAMS_CONVERSATION_GONE'] } },
        ],
        updatedAt: { lt: redactBefore },
      };
      const toRedact = await tx.integrationJob.findMany({
        where: redactable, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: terminalJobRetentionBatchSize, select: { id: true, version: true },
      });
      const redacted = toRedact.length === 0 ? 0 : (await tx.integrationJob.updateMany({
        where: { ...redactable, AND: [{ OR: toRedact.map(({ id, version }) => ({ id, version })) }] },
        data: { payload: { redacted: true }, lastError: terminalJobPayloadRedactedMarker, updatedAt: now, version: { increment: 1 } },
      })).count;
      return { held: false, redacted, deleted };
    });
    if (result.held) this.logger.warn('integration_terminal_retention_paused reason=legal_hold');
    if (result.redacted || result.deleted) this.logger.log(`integration_terminal_retention redacted=${result.redacted} deleted=${result.deleted}`);
    if (result.redacted === terminalJobRetentionBatchSize || result.deleted === terminalJobRetentionBatchSize) this.logger.warn('integration_terminal_retention_batch_limit_reached possible_backlog=true');
    return result;
  }
}
