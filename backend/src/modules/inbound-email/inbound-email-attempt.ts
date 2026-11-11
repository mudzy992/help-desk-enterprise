import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

export type InboundEmailAttemptSnapshot = {
  readonly id: string;
  readonly status: string;
  readonly attempts: number;
  readonly processingOwnerToken: string | null;
  readonly processingLeaseExpiresAt: Date | null;
};

/**
 * The durable identity of a provider message is capped by the VarChar(500)
 * column. Lookup and storage must normalize identically — otherwise a longer
 * provider id never matches its stored row and the message is skipped
 * forever. Mailbox operations (move) keep using the original full id.
 */
export function normalizeInboundProviderMessageId(providerMessageId: string): string {
  return providerMessageId.slice(0, 500);
}

/** Atomically claims a new, retryable, or lease-expired inbound message. */
export async function claimInboundEmailAttempt(
  prisma: PrismaService,
  input: {
    readonly mailboxKey: string;
    readonly providerMessageId: string;
    readonly existing: InboundEmailAttemptSnapshot | null;
    readonly now: Date;
    readonly leaseMs: number;
  },
) {
  const ownerToken = randomUUID();
  const leaseExpiresAt = new Date(input.now.getTime() + input.leaseMs);
  if (input.existing === null) {
    try {
      const row = await prisma.inboundEmail.create({
        data: {
          mailboxKey: input.mailboxKey,
          providerMessageId: normalizeInboundProviderMessageId(input.providerMessageId),
          subject: '',
          status: 'PROCESSING',
          processingPhase: 'CLAIMED',
          processingOwnerToken: ownerToken,
          processingLeaseExpiresAt: leaseExpiresAt,
        },
      });
      return { row, ownerToken };
    } catch (error) {
      if (isUniqueConstraintError(error)) return null;
      throw error;
    }
  }

  if (input.existing.status === 'PROCESSING' &&
      input.existing.processingLeaseExpiresAt !== null &&
      input.existing.processingLeaseExpiresAt > input.now) {
    return null;
  }
  if (input.existing.status !== 'PROCESSING' && input.existing.status !== 'FAILED') return null;

  const where = input.existing.status === 'PROCESSING'
    ? {
        id: input.existing.id,
        status: 'PROCESSING' as const,
        processingOwnerToken: input.existing.processingOwnerToken,
        processingLeaseExpiresAt:
          input.existing.processingLeaseExpiresAt === null
            ? null
            : { lte: input.now },
      }
    : { id: input.existing.id, status: 'FAILED' as const };
  const claimed = await prisma.inboundEmail.updateMany({
    where,
    data: {
      status: 'PROCESSING',
      processingOwnerToken: ownerToken,
      processingLeaseExpiresAt: leaseExpiresAt,
      attempts: { increment: 1 },
      reason: null,
    },
  });
  if (claimed.count !== 1) return null;

  const row = await prisma.inboundEmail.findUnique({ where: { id: input.existing.id } });
  if (row === null || row.processingOwnerToken !== ownerToken) return null;
  return { row, ownerToken };
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002';
}
