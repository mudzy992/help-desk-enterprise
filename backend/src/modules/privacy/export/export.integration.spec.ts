/**
 * Paket 2.6 (§14): data-subject export against a real PostgreSQL. Runs only
 * when PRIVACY_IT_DATABASE_URL points at a migrated, disposable database.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { DiskTicketAttachmentStorage } from '../../tickets/attachments/disk-ticket-attachment-storage';
import { PrivacyExportService } from './export.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

describeIfDatabase('privacy export (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let service: PrivacyExportService;
  let exportRoot: string;
  const stamp = Date.now();
  const ids: Record<string, string> = {};
  const actor = (id: string) => ({ principal: { subjectId: id }, requestId: null, sessionId: null }) as never;

  beforeAll(async () => {
    process.env.PRIVACY_EXPORT_KEY = 'integration-export-key-0123456789';
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const uploadRoot = mkdtempSync(path.join(tmpdir(), 'export-it-'));
    exportRoot = path.join(uploadRoot, 'privacy-exports');
    const loader = {
      load: async () => ({ exportIncludeAttachmentsDefault: true, exportMaxAttachmentBytes: 1024 * 1024, exportLinkValidDays: 7 }),
    };
    service = new PrivacyExportService(prisma as never, loader as never, new DiskTicketAttachmentStorage(uploadRoot), exportRoot);

    const unit = await prisma.organizationalUnit.create({
      data: { name: 'U', type: 'DIRECTORATE', distinguishedName: `OU=E${stamp}`, ouPath: `/e${stamp}` },
    });
    const category = await prisma.serviceCategory.create({ data: { name: 'C', slug: `ec${stamp}` } });
    const svc = await prisma.service.create({ data: { name: 'Štampači', slug: `es${stamp}`, categoryId: category.id } });
    const form = await prisma.formVersion.create({ data: { serviceId: svc.id, version: 1, schema: {} } });
    const dpo = await prisma.user.create({ data: { email: `dpo${stamp}@x.ba`, displayName: 'DPO Službenik' } });
    const other = await prisma.user.create({ data: { email: `o${stamp}@x.ba`, displayName: 'Drugi Admin' } });
    const agent = await prisma.user.create({ data: { email: `ag${stamp}@x.ba`, displayName: 'Edin Agent' } });
    const subject = await prisma.user.create({ data: { email: `s${stamp}@x.ba`, displayName: 'Selma Subjekt' } });
    Object.assign(ids, { dpo: dpo.id, other: other.id, subject: subject.id });
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `E-${stamp}`,
        title: '=HYPERLINK("x") ne radi štampač',
        description: 'Opis',
        formData: { floor: 3 },
        priority: 'LOW',
        impact: 'LOW',
        urgency: 'LOW',
        originUnitId: unit.id,
        serviceId: svc.id,
        formVersionId: form.id,
        requesterId: subject.id,
      },
    });
    const message = await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, type: 'USER_REPLY', body: 'Moja poruka', authorUserId: subject.id },
    });
    await prisma.ticketMessage.create({ data: { ticketId: ticket.id, type: 'AGENT_REPLY', body: 'Javni odgovor', authorUserId: agent.id } });
    await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, type: 'INTERNAL_NOTE', body: 'Tajna interna bilješka', authorUserId: agent.id },
    });
    const storagePath = `tickets/${ticket.id}/a.txt`;
    mkdirSync(path.join(uploadRoot, 'tickets', ticket.id), { recursive: true });
    writeFileSync(path.join(uploadRoot, storagePath), 'sadržaj priloga');
    await prisma.ticketAttachment.create({
      data: {
        ticketId: ticket.id,
        messageId: message.id,
        storagePath,
        originalName: 'račun/../x.txt',
        mimeType: 'text/plain',
        extension: 'txt',
        sizeBytes: 16,
        classification: 'INTERNAL',
        uploadedByUserId: subject.id,
      },
    });
    await prisma.userSession.create({
      data: { userId: subject.id, provider: 'local', expiresAt: new Date(Date.now() + 3_600_000), ipAddress: '10.1.2.3' },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('refuses internal notes without a reason and a second parallel export', async () => {
    await expect(service.create({ subjectUserId: ids.subject, includeInternalNotes: true }, actor(ids.dpo))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    const { view } = await service.create({ subjectUserId: ids.subject }, actor(ids.dpo));
    ids.export = view.id;
    expect(view.status).toBe('QUEUED');
    await expect(service.create({ subjectUserId: ids.subject }, actor(ids.dpo))).rejects.toMatchObject({ code: 'ALREADY_RUNNING' });
  });

  it('builds an encrypted package and only the requester downloads it', async () => {
    const summary = await service.execute(ids.export);
    expect(summary?.counts.tickets).toBe(1);
    const file = path.join(exportRoot, `${ids.export}.hdx`);
    expect(readFileSync(file).includes(Buffer.from('Moja poruka'))).toBe(false);
    expect(readFileSync(file).subarray(0, 4).toString()).toBe('HDX1');

    await expect(service.openDownload(ids.export, actor(ids.other))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const { stream, filename } = await service.openDownload(ids.export, actor(ids.dpo));
    expect(filename).toMatch(/\.zip$/);
    const zip = await JSZip.loadAsync(await collect(stream));
    const names = Object.keys(zip.files);
    expect(names).toEqual(
      expect.arrayContaining([
        'README.txt',
        'profile.json',
        'tickets.json',
        'tickets.csv',
        'messages.json',
        'authored.json',
        'activity.json',
        'sessions.json',
        'notifications.json',
        'audit.json',
      ]),
    );
    const messages = JSON.parse(await zip.file('messages.json')!.async('string')) as { author: string; body: string }[];
    expect(messages.map((m) => [m.author, m.body])).toEqual(
      expect.arrayContaining([
        ['Selma Subjekt', 'Moja poruka'],
        ['Agent', 'Javni odgovor'],
      ]),
    );
    expect(JSON.stringify(messages)).not.toContain('Tajna interna');
    expect(JSON.stringify(messages)).not.toContain('Edin Agent');
    const csv = await zip.file('tickets.csv')!.async('string');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(`"'=HYPERLINK(""x"") ne radi štampač"`);
    const attachment = names.find((name) => name.startsWith('attachments/') && name.endsWith('.txt'))!;
    expect(attachment).not.toContain('/../');
    expect(await zip.file(attachment)!.async('string')).toBe('sadržaj priloga');
    const sessions = JSON.parse(await zip.file('sessions.json')!.async('string')) as { ipAddress: string }[];
    expect(sessions[0].ipAddress).toBe('10.1.2.3');

    const row = await prisma.privacyExport.findUniqueOrThrow({ where: { id: ids.export } });
    expect(row.downloadCount).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'privacy.export.downloaded', entityId: ids.export } })).toBe(1);
  });

  it('includes internal notes only when requested with a reason', async () => {
    const { view } = await service.create(
      { subjectUserId: ids.subject, includeInternalNotes: true, includeAttachments: false, internalNotesReason: 'Zahtjev suda br. 123' },
      actor(ids.dpo),
    );
    await service.execute(view.id);
    const { stream } = await service.openDownload(view.id, actor(ids.dpo));
    const zip = await JSZip.loadAsync(await collect(stream));
    expect(await zip.file('messages.json')!.async('string')).toContain('Tajna interna');
    expect(Object.keys(zip.files).some((name) => name.startsWith('attachments/'))).toBe(false);
  });

  it('expires the link and deletes the file', async () => {
    await prisma.privacyExport.update({ where: { id: ids.export }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(service.openDownload(ids.export, actor(ids.dpo))).rejects.toMatchObject({ code: 'EXPORT_EXPIRED' });
    await service.maintain();
    expect(existsSync(path.join(exportRoot, `${ids.export}.hdx`))).toBe(false);
    expect((await prisma.privacyExport.findUniqueOrThrow({ where: { id: ids.export } })).status).toBe('EXPIRED');
  });

  // §5.2: opt-in (PRIVACY_IT_PERF=1) — 5000 tickets, 4 messages each, under 60 s.
  (process.env.PRIVACY_IT_PERF === '1' ? it : it.skip)('exports 5000 tickets within the budget', async () => {
    const template = await prisma.ticket.findFirstOrThrow({ where: { requesterId: ids.subject } });
    const rows = Array.from({ length: 5000 }, (_, index) => ({
      ticketNumber: `P-${stamp}-${index}`,
      title: `Perf ${index}`,
      description: 'x'.repeat(400),
      priority: template.priority,
      impact: template.impact,
      urgency: template.urgency,
      originUnitId: template.originUnitId,
      serviceId: template.serviceId,
      formVersionId: template.formVersionId,
      requesterId: ids.subject,
    }));
    await prisma.ticket.createMany({ data: rows });
    const created = await prisma.ticket.findMany({ where: { ticketNumber: { startsWith: `P-${stamp}-` } }, select: { id: true } });
    await prisma.ticketMessage.createMany({
      data: created.flatMap((t) =>
        Array.from({ length: 4 }, (_, n) => ({ ticketId: t.id, type: 'USER_REPLY' as const, body: `poruka ${n} `.repeat(20), authorUserId: ids.subject })),
      ),
    });
    const { view } = await service.create({ subjectUserId: ids.subject, includeAttachments: false }, actor(ids.dpo));
    const started = Date.now();
    const summary = await service.execute(view.id);
    const elapsed = Date.now() - started;
    console.log(`export perf: ${summary?.counts.tickets} tickets, ${summary?.counts.messages} messages in ${elapsed} ms`);
    expect(summary?.counts.tickets).toBe(5001);
    expect(elapsed).toBeLessThan(60_000);
  });
});
