import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createRoutedVpnTicket,
  createTicketsAttachmentsHarness,
} from './create-tickets-attachments-harness';
import { ticketsTestIds } from './create-tickets-service-harness';
import {
  attachmentUpload,
  pngFixture,
  storedZip,
} from './attachments-test-fixtures';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('TicketsAttachmentsService policy and storage', () => {
  const agentIt = { actorUserId: ticketsTestIds.agentIt };

  it('stores metadata and a physical file for an allowed PNG', async () => {
    const harness = createTicketsAttachmentsHarness();
    const ticketId = await createRoutedVpnTicket(harness);
    const created = await harness.attachments.upload(
      ticketId,
      attachmentUpload('diagram.png', pngFixture, {
        declaredMimeType: 'text/plain',
      }),
      agentIt,
    );
    expect(created).toMatchObject({
      ticketId,
      originalName: 'diagram.png',
      mimeType: 'image/png',
      extension: 'png',
      sizeBytes: pngFixture.length,
      classification: 'INTERNAL',
      uploadedByUserId: ticketsTestIds.agentIt,
    });
    const stored = [...harness.memory.attachments.values()][0];
    const absolute = path.join(harness.uploadRoot, stored.storagePath);
    expect(stored.storagePath.includes('diagram.png')).toBe(false);
    expect(readFileSync(absolute)).toEqual(pngFixture);
    const listed = await harness.attachments.list(ticketId, agentIt);
    expect(listed).toEqual([created]);
    const downloaded = await harness.attachments.download(
      ticketId,
      created.id,
      agentIt,
    );
    expect(downloaded.contents).toEqual(pngFixture);
    expect(
      harness.memory.changeLogs.some(
        (entry) =>
          entry.entityType === 'ticket_attachment' &&
          entry.reason === 'ticket_attachment_upload' &&
          entry.entityId === created.id,
      ),
    ).toBe(true);
  });

  it('accepts allow-listed Office documents and rejects other types', async () => {
    const harness = createTicketsAttachmentsHarness();
    const ticketId = await createRoutedVpnTicket(harness);
    const docx = storedZip([{ name: 'word/document.xml', content: '<w/>' }]);
    const uploaded = await harness.attachments.upload(
      ticketId,
      attachmentUpload('brief.docx', docx),
      agentIt,
    );
    expect(uploaded.mimeType).toContain('wordprocessingml');
    await expect(
      harness.attachments.upload(
        ticketId,
        attachmentUpload('payload.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00])),
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'ATTACHMENT_TYPE_NOT_ALLOWED' } });
    await expect(
      harness.attachments.upload(
        ticketId,
        attachmentUpload('notes.png', Buffer.from('not an image')),
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'ATTACHMENT_TYPE_NOT_ALLOWED' } });
  });

  it('rejects oversized files and path-traversal names', async () => {
    const harness = createTicketsAttachmentsHarness();
    const ticketId = await createRoutedVpnTicket(harness);
    const oversized = Buffer.concat([
      pngFixture.subarray(0, 8),
      Buffer.alloc(25 * 1024 * 1024),
    ]);
    await expect(
      harness.attachments.upload(
        ticketId,
        attachmentUpload('huge.png', oversized),
        agentIt,
      ),
    ).rejects.toMatchObject({ response: { code: 'ATTACHMENT_TOO_LARGE' } });
    await expect(
      harness.attachments.upload(
        ticketId,
        attachmentUpload('../../etc/passwd.png', pngFixture),
        agentIt,
      ),
    ).rejects.toMatchObject({
      response: { code: 'ATTACHMENT_FILENAME_INVALID' },
    });
    await expect(
      harness.attachments.upload(
        ticketId,
        attachmentUpload('..\\windows\\x.png', pngFixture),
        agentIt,
      ),
    ).rejects.toMatchObject({
      response: { code: 'ATTACHMENT_FILENAME_INVALID' },
    });
  });

  it('deletes metadata and the physical file together', async () => {
    const harness = createTicketsAttachmentsHarness();
    const ticketId = await createRoutedVpnTicket(harness);
    const created = await harness.attachments.upload(
      ticketId,
      attachmentUpload('keep.png', pngFixture),
      agentIt,
    );
    const stored = [...harness.memory.attachments.values()][0];
    const absolute = path.join(harness.uploadRoot, stored.storagePath);
    expect(existsSync(absolute)).toBe(true);
    await harness.attachments.remove(ticketId, created.id, agentIt);
    expect(harness.memory.attachments.size).toBe(0);
    expect(existsSync(absolute)).toBe(false);
    expect(
      harness.memory.changeLogs.some(
        (entry) =>
          entry.entityType === 'ticket_attachment' &&
          entry.reason === 'ticket_attachment_delete',
      ),
    ).toBe(true);
    await expect(
      harness.attachments.download(ticketId, created.id, agentIt),
    ).rejects.toMatchObject({ response: { code: 'ATTACHMENT_NOT_FOUND' } });
  });
});
