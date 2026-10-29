import { createHash, randomUUID } from 'node:crypto';
import type { StagedStorageAdapter } from '../../../common/storage-write/storage-write.types';
import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketAttachmentRecord, TicketAttachmentStorage } from '../attachments/attachments.types';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import type { SplitTicketChildInput, TicketSplitConfiguration } from './split.types';
import { splitAttachmentStorageNamespace } from './split-attachment-storage-reconciler.service';
import type { SplitStoragePromotion } from './split-storage-promotion';

export async function transferSplitAttachments(input: {
  readonly prisma: PrismaService;
  readonly storage: TicketAttachmentStorage;
  readonly stagedStorage: StagedStorageAdapter;
  readonly promotions: SplitStoragePromotion[];
  readonly parent: TicketRecord;
  readonly child: TicketRecord;
  readonly request: SplitTicketChildInput;
  readonly configuration: TicketSplitConfiguration;
}): Promise<void> {
  const selected = uniqueIds(input.request.attachmentIds);
  if (selected.length === 0) return;
  const records = (await input.prisma.ticketAttachment.findMany({
    where: { ticketId: input.parent.id, id: { in: [...selected] } },
  })) as TicketAttachmentRecord[];
  if (records.length !== selected.length) throw new TicketsError('ATTACHMENT_NOT_FOUND');
  const move = input.request.moveAttachments === true;
  if (move && !input.configuration.allowAttachmentMove) throw new TicketsError('SPLIT_NOT_ALLOWED');
  for (const record of records) {
    if (move) {
      await input.prisma.ticketAttachment.update({ where: { id: record.id }, data: { ticketId: input.child.id, messageId: null } });
      continue;
    }
    const intentId = randomUUID();
    const stagingKey = `.staging/${intentId}`;
    const finalKey = `tickets/${input.child.id}/split-${record.id}.${record.extension}`;
    const contents = await input.storage.read(record.storagePath);
    const contentHash = createHash('sha256').update(contents).digest('hex');
    await input.stagedStorage.stage(stagingKey, contents);
    await input.prisma.storageWriteIntent.create({ data: {
      id: intentId, namespace: splitAttachmentStorageNamespace, key: `${record.id}:${input.child.id}`,
      stagingKey, finalKey, contentHash, sizeBytes: contents.length,
    } });
    await input.prisma.ticketAttachment.create({ data: {
      ticketId: input.child.id, messageId: null, storagePath: finalKey,
      originalName: record.originalName, mimeType: record.mimeType, extension: record.extension,
      sizeBytes: contents.length, classification: input.child.classification, uploadedByUserId: record.uploadedByUserId,
    } });
    input.promotions.push({ intentId, stagingKey, finalKey });
  }
}

function uniqueIds(ids: readonly string[] | undefined): readonly string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
}
