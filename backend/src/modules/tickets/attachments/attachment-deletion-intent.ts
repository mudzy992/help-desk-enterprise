import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketAttachmentStorage } from './attachments.types';

export const attachmentDeletionNamespace = 'ticket.attachment.delete';
const emptyHash = '0'.repeat(64);

export async function createAttachmentDeletionIntent(
  prisma: PrismaService,
  input: { attachmentId: string; storagePath: string; sizeBytes: number },
): Promise<string> {
  const id = randomUUID();
  const row = await prisma.storageWriteIntent.upsert({
    where: { namespace_key: { namespace: attachmentDeletionNamespace, key: input.attachmentId } },
    create: {
      id,
      namespace: attachmentDeletionNamespace,
      key: input.attachmentId,
      stagingKey: input.storagePath,
      finalKey: `.deleted/${id}`,
      contentHash: emptyHash,
      sizeBytes: input.sizeBytes,
      status: 'PENDING_PROMOTION',
    },
    update: {},
    select: { id: true },
  });
  return row.id;
}

export async function promoteAttachmentDeletion(input: {
  prisma: PrismaService;
  storage: TicketAttachmentStorage;
  intentId: string;
}): Promise<boolean> {
  const intent = await input.prisma.storageWriteIntent.findUniqueOrThrow({ where: { id: input.intentId } });
  try {
    await input.storage.remove(intent.stagingKey);
    await input.prisma.storageWriteIntent.updateMany({
      where: { id: intent.id, status: { in: ['PENDING_PROMOTION', 'PROCESSING'] } },
      data: { status: 'READY', readyAt: new Date(), ownerToken: null, leaseExpiresAt: null, lastError: null },
    });
    return true;
  } catch (error) {
    await input.prisma.storageWriteIntent.updateMany({
      where: { id: intent.id, status: 'PENDING_PROMOTION' },
      data: { lastError: describe(error), nextAttemptAt: new Date() },
    });
    return false;
  }
}

function describe(error: unknown): string {
  return (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 1000);
}
