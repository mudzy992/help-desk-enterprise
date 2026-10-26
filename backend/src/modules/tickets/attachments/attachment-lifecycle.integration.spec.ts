import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { runAttachmentQuotaTransaction } from './run-attachment-quota-transaction';
import { createAttachmentDeletionIntent, promoteAttachmentDeletion } from './attachment-deletion-intent';
import { AttachmentDeletionReconciler } from './attachment-deletion-reconciler.service';
import type { TicketAttachmentStorage } from './attachments.types';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('ticket attachment quota and durable deletion lifecycle', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let ticketId: string;
  let actorId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await prisma.organizationalUnit.create({ data: { name: `Attachment ${stamp}`, type: 'DIRECTORATE', distinguishedName: `OU=ATL${stamp}`, ouPath: `/atl${stamp}` } });
    const category = await prisma.serviceCategory.create({ data: { name: `Attachment ${stamp}`, slug: `atl-cat-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Attachment ${stamp}`, slug: `atl-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await prisma.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const actor = await prisma.user.create({ data: { email: `attachment-${stamp}@example.test`, displayName: 'Attachment actor' } });
    actorId = actor.id;
    const ticket = await prisma.ticket.create({ data: { ticketNumber: `ATL-${stamp}`, title: 'Attachment lifecycle', description: 'proof', formData: {}, priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'PENDING', serviceId: service.id, formVersionId: form.id, requesterId: actor.id, originUnitId: unit.id } as never });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.storageWriteIntent.deleteMany({ where: { namespace: 'ticket.attachment.delete' } });
    await prisma.ticket.delete({ where: { id: ticketId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const attachmentData = (name: string, path: string) => ({ ticketId, storagePath: path, originalName: name, mimeType: 'text/plain', extension: 'txt', sizeBytes: 5, classification: 'INTERNAL', uploadedByUserId: actorId }) as const;

  it('serializes concurrent quota claims so only one upload reaches max one', async () => {
    const outcomes = await Promise.allSettled(['one', 'two'].map((name) =>
      runAttachmentQuotaTransaction({ prisma: prisma as never, ticketId, maxFiles: 1,
        operation: (transaction) => transaction.ticketAttachment.create({ data: attachmentData(`${name}.txt`, `tickets/${ticketId}/${name}.txt`) as never }) }),
    ));
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.ticketAttachment.count({ where: { ticketId } })).toBe(1);
  });

  it('commits metadata deletion with an intent and reconciles a failed blob remove', async () => {
    await prisma.ticketAttachment.deleteMany({ where: { ticketId } });
    const record = await prisma.ticketAttachment.create({ data: attachmentData('delete.txt', `tickets/${ticketId}/delete.txt`) as never });
    const existing = new Set([record.storagePath]);
    let fail = true;
    const storage: TicketAttachmentStorage = {
      write: async () => record.storagePath,
      read: async (key) => { if (!existing.has(key)) throw new Error('NOT_FOUND'); return Buffer.from('proof'); },
      remove: async (key) => { if (fail) { fail = false; throw new Error('INJECTED_DELETE_FAULT'); } existing.delete(key); },
    };
    const intentId = await prisma.$transaction(async (transaction) => {
      const id = await createAttachmentDeletionIntent(transaction as never, { attachmentId: record.id, storagePath: record.storagePath, sizeBytes: record.sizeBytes });
      await transaction.ticketAttachment.delete({ where: { id: record.id } });
      return id;
    });
    expect(await promoteAttachmentDeletion({ prisma: prisma as never, storage, intentId })).toBe(false);
    expect(await prisma.ticketAttachment.findUnique({ where: { id: record.id } })).toBeNull();
    expect(existing.has(record.storagePath)).toBe(true);
    const reconciler = new AttachmentDeletionReconciler(prisma as never, storage);
    expect(await reconciler.reconcileOne()).toBe(true);
    expect(existing.has(record.storagePath)).toBe(false);
    expect((await prisma.storageWriteIntent.findUniqueOrThrow({ where: { id: intentId } })).status).toBe('READY');
  });
});
