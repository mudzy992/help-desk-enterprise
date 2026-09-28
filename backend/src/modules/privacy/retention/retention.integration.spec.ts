/**
 * Paket 2.6 (§14): retention against a real PostgreSQL. Runs only when
 * PRIVACY_IT_DATABASE_URL points at a migrated, disposable database:
 *   PRIVACY_IT_DATABASE_URL=postgresql://postgres@127.0.0.1:54329/hd npx jest retention.integration
 */
import { mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { appendAuditLog } from '../../audit-log/append-audit-log';
import { defaultAuditHashAlgorithm } from '../../audit-log/audit-log.constants';
import { verifyAuditLogChain, compareAuditLogChainOrder } from '../../audit-log/verify-audit-log-chain';
import { DiskTicketAttachmentStorage } from '../../tickets/attachments/disk-ticket-attachment-storage';
import type { PrivacyConfiguration } from '../privacy-configuration.loader';
import { retentionRedactionMarker } from './retention-executors';
import { RetentionService } from './retention.service';
import { LegalHoldService } from '../legal-hold/legal-hold.service';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;
const day = 86_400_000;

function fakeRedis() {
  const keys = new Set<string>();
  return {
    set: jest.fn(async (key: string, ..._args: unknown[]) => {
      if (keys.has(key)) return null;
      keys.add(key);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => (keys.delete(key) ? 1 : 0)),
  };
}

describeIfDatabase('retention (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let uploadRoot: string;
  const now = new Date();
  const old = new Date(now.getTime() - 400 * day);
  const configuration = (overrides: Partial<PrivacyConfiguration['retentionDays']> = {}) =>
    ({
      enabled: true,
      runAtLocalTime: '02:30',
      maxMinutesPerNight: 30,
      timeZone: 'Europe/Sarajevo',
      retentionDays: {
        attachments: 90,
        ticketContent: 180,
        audit: 365,
        sessions: 90,
        emailDeliveries: 180,
        requestRegister: 365,
        ...overrides,
      },
    }) as unknown as PrivacyConfiguration;

  const ids: Record<string, string> = {};

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    uploadRoot = mkdtempSync(path.join(tmpdir(), 'retention-it-'));
    const unit = await prisma.organizationalUnit.create({
      data: { name: 'U', type: 'DIRECTORATE', distinguishedName: `OU=U${Date.now()}`, ouPath: `/u${Date.now()}` },
    });
    const category = await prisma.serviceCategory.create({ data: { name: 'C', slug: `c${Date.now()}` } });
    const service = await prisma.service.create({ data: { name: 'S', slug: `s${Date.now()}`, categoryId: category.id } });
    const form = await prisma.formVersion.create({ data: { serviceId: service.id, version: 1, schema: {} } });
    const requester = await prisma.user.create({ data: { email: `r${Date.now()}@x.ba`, displayName: 'Ana Anić' } });
    const heldRequester = await prisma.user.create({
      data: { email: `h${Date.now()}@x.ba`, displayName: 'Held', legalHoldAt: now, legalHoldReason: 'Sudski spor' },
    });
    const ticket = (n: string, over: Record<string, unknown>) =>
      prisma.ticket.create({
        data: {
          ticketNumber: `${n}-${Date.now()}`,
          title: `Ana Anić ${n}`,
          description: 'Lični opis',
          formData: { phone: '061' },
          priority: 'LOW',
          impact: 'LOW',
          urgency: 'LOW',
          originUnitId: unit.id,
          serviceId: service.id,
          formVersionId: form.id,
          requesterId: requester.id,
          status: 'CLOSED',
          closedAt: old,
          ...over,
        },
      });
    const due = await ticket('DUE', {});
    const recent = await ticket('RECENT', { closedAt: new Date(now.getTime() - 10 * day) });
    const open = await ticket('OPEN', { status: 'IN_PROGRESS', closedAt: null });
    const held = await ticket('HELD', { legalHoldAt: now, legalHoldReason: 'Spor' });
    const heldByRequester = await ticket('HELDREQ', { requesterId: heldRequester.id });
    Object.assign(ids, { due: due.id, recent: recent.id, open: open.id, held: held.id, heldByRequester: heldByRequester.id });
    for (const t of [due, recent, open, held, heldByRequester]) {
      const message = await prisma.ticketMessage.create({
        data: { ticketId: t.id, type: 'USER_REPLY', body: 'Pozdrav, Ana', authorUserId: requester.id },
      });
      const storagePath = `tickets/${t.id}/f.txt`;
      mkdirSync(path.join(uploadRoot, 'tickets', t.id), { recursive: true });
      writeFileSync(path.join(uploadRoot, storagePath), 'x'.repeat(100));
      await prisma.ticketAttachment.create({
        data: {
          ticketId: t.id,
          messageId: message.id,
          storagePath,
          originalName: 'f.txt',
          mimeType: 'text/plain',
          extension: 'txt',
          sizeBytes: 100,
          classification: 'INTERNAL',
          uploadedByUserId: requester.id,
        },
      });
    }
    await prisma.ticketCsat.create({ data: { ticketId: due.id, rating: 5, comment: 'Ana je super', submittedByUserId: requester.id } });
    // Sessions: ended long ago, still active, recently revoked.
    await prisma.userSession.createMany({
      data: [
        { userId: requester.id, provider: 'local', expiresAt: old, createdAt: old, ipAddress: '10.0.0.1' },
        { userId: requester.id, provider: 'local', expiresAt: new Date(now.getTime() + day) },
        { userId: requester.id, provider: 'local', expiresAt: new Date(now.getTime() + day), revokedAt: new Date(now.getTime() - day) },
      ],
    });
    // Audit chain of 8 rows; the first 5 are backdated beyond the 365-day period.
    for (let index = 0; index < 8; index += 1) {
      await prisma.$transaction((tx) =>
        appendAuditLog(tx as never, {
          action: 'test.event',
          entityType: 'test',
          entityId: `e${index}`,
          metadata: { index },
          actorUserId: null,
        }),
      );
    }
    const chain = (await prisma.auditLog.findMany()).sort(compareAuditLogChainOrder);
    for (const [index, row] of chain.slice(0, 5).entries()) {
      await prisma.auditLog.update({ where: { id: row.id }, data: { createdAt: new Date(old.getTime() + index * 1000) } });
    }
    ids.requester = requester.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function service(config: PrivacyConfiguration) {
    return new RetentionService(
      prisma as never,
      { load: async () => config } as never,
      new DiskTicketAttachmentStorage(uploadRoot),
      fakeRedis() as never,
    );
  }

  const deadline = () => new Date(Date.now() + 60_000);

  it('skips content categories without a dry run', async () => {
    const run = await service(configuration()).runCategory({
      category: 'ticketContent',
      mode: 'EXECUTE',
      triggeredByUserId: null,
      deadline: deadline(),
    });
    expect(run.status).toBe('SKIPPED');
    expect(run.error).toBe('dry_run_required');
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ids.due } })).contentRedactedAt).toBeNull();
  });

  it('dry run count equals the executed count, only for due, unheld, closed tickets', async () => {
    const svc = service(configuration());
    const dry = await svc.runCategory({ category: 'ticketContent', mode: 'DRY_RUN', triggeredByUserId: ids.requester, deadline: deadline() });
    expect(dry.status).toBe('COMPLETED');
    const executed = await svc.runCategory({ category: 'ticketContent', mode: 'EXECUTE', triggeredByUserId: null, deadline: deadline() });
    expect(executed.status).toBe('COMPLETED');
    expect(executed.itemCount).toBe(dry.itemCount);
    expect(executed.itemCount).toBe(1);
    const due = await prisma.ticket.findUniqueOrThrow({ where: { id: ids.due }, include: { messages: true, csat: true } });
    expect(due.title).toBe(retentionRedactionMarker);
    expect(due.description).toBe(retentionRedactionMarker);
    expect(due.formData).toBeNull();
    expect(due.contentRedactedAt).not.toBeNull();
    expect(due.messages.every((message) => message.body === retentionRedactionMarker && message.redactedAt !== null)).toBe(true);
    expect(due.csat?.rating).toBe(5);
    expect(due.csat?.comment).toBeNull();
    expect(due.status).toBe('CLOSED');
    for (const key of ['recent', 'open', 'held', 'heldByRequester']) {
      const untouched = await prisma.ticket.findUniqueOrThrow({ where: { id: ids[key] } });
      expect(untouched.contentRedactedAt).toBeNull();
      expect(untouched.description).toBe('Lični opis');
    }
    // Idempotent: nothing left, and the earlier execution authorises the next nights.
    const again = await svc.runCategory({ category: 'ticketContent', mode: 'EXECUTE', triggeredByUserId: null, deadline: deadline() });
    expect(again.status).toBe('COMPLETED');
    expect(again.itemCount).toBe(0);
  });

  it('removes attachment files and rows of due tickets only', async () => {
    const svc = service(configuration());
    const dry = await svc.runCategory({ category: 'attachments', mode: 'DRY_RUN', triggeredByUserId: ids.requester, deadline: deadline() });
    const executed = await svc.runCategory({ category: 'attachments', mode: 'EXECUTE', triggeredByUserId: null, deadline: deadline() });
    expect(dry.itemCount).toBe(1);
    expect(dry.bytesFreed).toBe(100);
    expect(executed.itemCount).toBe(1);
    expect(executed.bytesFreed).toBe(100);
    expect(executed.refsCount).toBe(1);
    expect(existsSync(path.join(uploadRoot, 'tickets', ids.due, 'f.txt'))).toBe(false);
    expect(existsSync(path.join(uploadRoot, 'tickets', ids.held, 'f.txt'))).toBe(true);
    expect(await prisma.ticketAttachment.count({ where: { ticketId: ids.due } })).toBe(0);
    expect(await prisma.ticketAttachment.count({ where: { ticketId: ids.held } })).toBe(1);
    const csv = await svc.runRefsCsv(executed.id);
    expect(csv.body.split('\n')[1]).toMatch(/^DUE-/);
  });

  it('deletes only ended sessions older than the period', async () => {
    const run = await service(configuration()).runCategory({
      category: 'sessions',
      mode: 'EXECUTE',
      triggeredByUserId: null,
      deadline: deadline(),
    });
    expect(run.itemCount).toBe(1);
    expect(await prisma.userSession.count({ where: { userId: ids.requester } })).toBe(2);
  });

  it('purges old audit rows behind a checkpoint and the chain still verifies', async () => {
    const svc = service(configuration());
    await svc.runCategory({ category: 'audit', mode: 'DRY_RUN', triggeredByUserId: ids.requester, deadline: deadline() });
    const run = await svc.runCategory({ category: 'audit', mode: 'EXECUTE', triggeredByUserId: null, deadline: deadline() });
    expect(run.itemCount).toBe(5);
    const checkpoint = await prisma.auditChainCheckpoint.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    expect(checkpoint.purgedCount).toBe(5);
    const records = (await prisma.auditLog.findMany()).map((row) => ({ ...row, metadata: row.metadata as never }));
    const result = verifyAuditLogChain({
      records: records as never,
      hashAlgorithm: defaultAuditHashAlgorithm,
      start: checkpoint,
    });
    expect(result.valid).toBe(true);
    // 3 remaining test rows + retention run audits + the purge entry.
    expect(result.checkedCount).toBe(await prisma.auditLog.count());
    expect(await prisma.auditLog.count({ where: { action: 'test.event' } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: 'audit.retention.purged' } })).toBe(1);
  });

  it('refuses a disabled category and a parallel run', async () => {
    await expect(
      service(configuration({ attachments: 0 })).runCategory({
        category: 'attachments',
        mode: 'DRY_RUN',
        triggeredByUserId: null,
        deadline: deadline(),
      }),
    ).rejects.toMatchObject({ code: 'RETENTION_DISABLED' });
    const redis = fakeRedis();
    await redis.set('privacy:retention:lock:sessions');
    const svc = new RetentionService(
      prisma as never,
      { load: async () => configuration() } as never,
      new DiskTicketAttachmentStorage(uploadRoot),
      redis as never,
    );
    await expect(
      svc.runCategory({ category: 'sessions', mode: 'EXECUTE', triggeredByUserId: null, deadline: deadline() }),
    ).rejects.toMatchObject({ code: 'ALREADY_RUNNING' });
  });

  it('legal hold: set once, clear once, audited, blocks retention of the ticket', async () => {
    const holds = new LegalHoldService(prisma as never);
    const actor = { principal: { subjectId: ids.requester }, requestId: null, sessionId: null } as never;
    await holds.set('ticket', ids.recent, 'Zahtjev suda br. 123', actor);
    await expect(holds.set('ticket', ids.recent, 'Zahtjev suda br. 123', actor)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    expect((await holds.list()).map((hold) => hold.id)).toEqual(expect.arrayContaining([ids.recent, ids.held]));
    await holds.clear('ticket', ids.recent, 'Postupak okončan', actor);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ids.recent } })).legalHoldAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: ids.recent, action: { startsWith: 'privacy.legal_hold' } } })).toBe(2);
    await expect(holds.set('user', 'missing', 'Razlog razlog', actor)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('nightly sweep runs once per night inside the window, in order', async () => {
    const redis = fakeRedis();
    const svc = new RetentionService(
      prisma as never,
      { load: async () => configuration() } as never,
      new DiskTicketAttachmentStorage(uploadRoot),
      redis as never,
    );
    // 02:45 Sarajevo in winter = 01:45 UTC; 12:00 UTC is outside the window.
    expect(await svc.sweepNightly(new Date('2026-12-01T12:00:00Z'))).toEqual([]);
    const runs = await svc.sweepNightly(new Date('2026-12-01T01:45:00Z'));
    expect(runs.map((run) => run.category)).toEqual([
      'sessions',
      'emailDeliveries',
      'requestRegister',
      'attachments',
      'ticketContent',
      'audit',
    ]);
    expect(await svc.sweepNightly(new Date('2026-12-01T02:00:00Z'))).toEqual([]);
  });
});
