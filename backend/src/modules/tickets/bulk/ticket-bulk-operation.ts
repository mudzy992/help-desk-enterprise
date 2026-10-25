import { createHash } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client';
import { canonicalizeJson } from '../../change-log/canonicalize-json';
import { IdempotencyError, idempotencyErrorCodes } from '../../../common/idempotency/idempotency.error';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { ExecuteTicketBulkInput, TicketBulkExecutionSummary } from './bulk.types';

export type BulkOperationClient = PrismaService | Prisma.TransactionClient;

export type StoredBulkOperation = {
  id: string;
  requestHash: string;
  status: string;
  responseBody: unknown;
};

export function hashBulkRequest(body: ExecuteTicketBulkInput, actorUserId: string): string {
  const request = { ...body, ticketIds: [...body.ticketIds], actorUserId };
  return createHash('sha256').update(JSON.stringify(canonicalizeJson(request as never))).digest('hex');
}

export async function claimBulkOperation(
  prisma: BulkOperationClient,
  body: ExecuteTicketBulkInput & { operationId: string; mode: 'atomic' | 'best-effort' },
  actorUserId: string,
): Promise<{ replay: TicketBulkExecutionSummary | null }> {
  const requestHash = hashBulkRequest(body, actorUserId);
  try {
    await prisma.ticketBulkOperation.create({ data: {
      id: body.operationId, actorUserId, mode: body.mode, actionType: body.actionType,
      requestHash, total: body.ticketIds.length,
      items: { create: body.ticketIds.map((ticketId, ordinal) => ({ itemKey: ticketId, ticketId, ordinal })) },
    } });
    return { replay: null };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.ticketBulkOperation.findUnique({ where: { id: body.operationId } }) as StoredBulkOperation | null;
    if (existing === null || existing.requestHash !== requestHash) throw new IdempotencyError(idempotencyErrorCodes.payloadMismatch);
    if (existing.status === 'PROCESSING' || existing.responseBody === null) throw new IdempotencyError(idempotencyErrorCodes.inProgress);
    return { replay: existing.responseBody as TicketBulkExecutionSummary };
  }
}

export async function completeBulkOperation(
  prisma: BulkOperationClient,
  operationId: string,
  summary: TicketBulkExecutionSummary,
): Promise<void> {
  await prisma.ticketBulkOperation.update({ where: { id: operationId }, data: {
    status: summary.outcome, succeeded: summary.succeeded, failed: summary.failed,
    rolledBack: summary.rolledBack, skipped: summary.skipped,
    responseBody: summary as never, completedAt: new Date(),
  } });
}
