import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { StorageWriteService } from '../../../common/storage-write/storage-write.service';
import { DiskStagedStorageAdapter } from '../../../common/storage-write/disk-staged-storage.adapter';
import type { StagedStorageAdapter } from '../../../common/storage-write/storage-write.types';
import { DiskTicketAttachmentStorage } from '../attachments/disk-ticket-attachment-storage';
import { transferSplitAttachments } from './transfer-split-attachments';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('ticket split attachment durable copy', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let root: string;
  let parentId: string;
  let childId: string;
  let actorId: string;
  let sourceAttachmentId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    root = await mkdtemp(path.join(tmpdir(), 'split-attachment-'));
    const unit = await prisma.organizationalUnit.create({ data: { name: 'Split IT', type: 'DIRECTORATE', distinguishedName: `OU=SPL${stamp}`, ouPath: `/spl${stamp}` } });
    const category = await prisma.serviceCategory.create({ data: { name: `Split ${stamp}`, slug: `spl-cat-${stamp}` } });
    const service = await prisma.service.create({ data: { name: `Split ${stamp}`, slug: `spl-svc-${stamp}`, categoryId: category.id, lifecycle: 'ACTIVE' } });
    const form = await prisma.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const actor = await prisma.user.create({ data: { email: `split-${stamp}@example.test`, displayName: 'Split actor' } });
    actorId = actor.id;
    const base = { description: 'storage proof', formData: {}, priority: 'LOW', impact: 'LOW', urgency: 'LOW', status: 'IN_PROGRESS', serviceId: service.id, formVersionId: form.id, requesterId: actor.id, originUnitId: unit.id } as const;
    const parent = await prisma.ticket.create({ data: { ...base, ticketNumber: `SPL-P-${stamp}`, title: 'Parent' } as never });
    const child = await prisma.ticket.create({ data: { ...base, ticketNumber: `SPL-C-${stamp}`, title: 'Child', parentTicketId: parent.id } as never });
    parentId = parent.id; childId = child.id;
    const storage = new DiskTicketAttachmentStorage(root);
    const storagePath = await storage.write({ ticketId: parent.id, extension: 'txt', contents: Buffer.from('durable split contents') });
    const source = await prisma.ticketAttachment.create({ data: { ticketId: parent.id, storagePath, originalName: 'proof.txt', mimeType: 'text/plain', extension: 'txt', sizeBytes: 22, classification: 'INTERNAL', uploadedByUserId: actor.id } });
    sourceAttachmentId = source.id;
  });

  afterAll(async () => {
    await prisma.storageWriteIntent.deleteMany({ where: { namespace: 'ticket.split.attachment' } });
    await prisma.ticket.deleteMany({ where: { id: { in: [childId, parentId] } } });
    await prisma.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await prisma.$disconnect();
    await rm(root, { recursive: true, force: true });
  });

  it('persists a real copy intent and converges after promotion failure', async () => {
    const storage = new DiskTicketAttachmentStorage(root);
    const disk = new DiskStagedStorageAdapter(root);
    let failed = false;
    const flaky: StagedStorageAdapter = { stage: (key, value) => disk.stage(key, value), remove: (key) => disk.remove(key),
      promote: async (staging, final) => { if (!failed) { failed = true; throw new Error('injected promotion fault'); } await disk.promote(staging, final); } };
    const parent = await prisma.ticket.findUniqueOrThrow({ where: { id: parentId } });
    const child = await prisma.ticket.findUniqueOrThrow({ where: { id: childId } });
    const writes = new StorageWriteService(prisma as never);
    await transferSplitAttachments({ prisma: prisma as never, storage, storageWrites: writes, stagedStorage: flaky,
      parent: parent as never, child: child as never,
      request: { title: 'Child', attachmentIds: [sourceAttachmentId] } as never,
      configuration: { allowAttachmentMove: true } as never });
    const copied = await prisma.ticketAttachment.findFirstOrThrow({ where: { ticketId: childId } });
    expect(copied.storagePath.startsWith(`tickets/${childId}/split-`)).toBe(true);
    await expect(storage.read(copied.storagePath)).rejects.toMatchObject({ response: { code: 'ATTACHMENT_NOT_FOUND' } });
    expect(await writes.reconcileOne('ticket.split.attachment', disk)).toBe('ready');
    expect((await storage.read(copied.storagePath)).toString()).toBe('durable split contents');
    expect((await storage.read((await prisma.ticketAttachment.findUniqueOrThrow({ where: { id: sourceAttachmentId } })).storagePath)).toString()).toBe('durable split contents');
  });
});
