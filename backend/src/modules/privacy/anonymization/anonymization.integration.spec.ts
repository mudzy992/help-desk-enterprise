/**
 * Paket 2.6 (§14): anonymization against a real PostgreSQL. Runs only when
 * PRIVACY_IT_DATABASE_URL points at a migrated, disposable database.
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { appendAuditLog } from '../../audit-log/append-audit-log';
import { defaultAuditHashAlgorithm } from '../../audit-log/audit-log.constants';
import { compareAuditLogChainOrder, verifyAuditLogChain } from '../../audit-log/verify-audit-log-chain';
import { InboundRawStore } from '../../inbound-email/inbound-raw-store';
import { DiskTicketAttachmentStorage } from '../../tickets/attachments/disk-ticket-attachment-storage';
import { AnonymizationService } from './anonymization.service';
import { loadReturningAnonymizedCheck } from './returning-anonymized';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;
const day = 86_400_000;

describeIfDatabase('anonymization (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let service: AnonymizationService;
  let rawRoot: string;
  const stamp = Date.now();
  const email = `amra.hodzic.${stamp}@epbih.ba`;
  const rawKey = `2026-01/raw${stamp}.eml.gz`;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.PRIVACY_TOMBSTONE_KEY = 'integration-tombstone-key-0123456789';
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const uploadRoot = mkdtempSync(path.join(tmpdir(), 'anon-it-'));
    rawRoot = path.join(uploadRoot, 'inbound-raw');
    const loader = { load: async () => ({ enabled: true, candidateAfterDays: 180, requireSecondApprover: false, deleteOwnAttachmentsDefault: false }) };
    service = new AnonymizationService(
      prisma as never,
      loader as never,
      new DiskTicketAttachmentStorage(uploadRoot),
      new InboundRawStore(rawRoot),
    );

    const unit = await prisma.organizationalUnit.create({
      data: { name: 'U', type: 'DIRECTORATE', distinguishedName: `OU=A${stamp}`, ouPath: `/a${stamp}` },
    });
    const category = await prisma.serviceCategory.create({ data: { name: 'C', slug: `ac${stamp}` } });
    const svc = await prisma.service.create({ data: { name: 'S', slug: `as${stamp}`, categoryId: category.id } });
    const form = await prisma.formVersion.create({ data: { serviceId: svc.id, version: 1, schema: {} } });
    const admin = await prisma.user.create({ data: { email: `admin${stamp}@x.ba`, displayName: 'Admin Adminić' } });
    const agent = await prisma.user.create({ data: { email: `agent${stamp}@x.ba`, displayName: 'Edin Agent' } });
    const subject = await prisma.user.create({
      data: {
        email,
        displayName: 'Amra Hodžić',
        isActive: false,
        directoryObjectGuid: `guid-${stamp}`,
        directoryDeactivatedAt: new Date(Date.now() - 200 * day),
        distinguishedName: `CN=Amra Hodžić,OU=A${stamp}`,
        department: 'IT',
        managerUserId: agent.id,
      },
    });
    await prisma.user.update({ where: { id: agent.id }, data: { managerUserId: subject.id } });
    Object.assign(ids, { admin: admin.id, agent: agent.id, subject: subject.id });

    const ticket = (title: string, over: Record<string, unknown> = {}) =>
      prisma.ticket.create({
        data: {
          ticketNumber: `A-${title}-${stamp}`,
          title,
          description: `Prijavila Amra Hodžić (${email}), login ahodzic${stamp}.`,
          formData: { contact: 'Amra Hodžić', phone: '061 111 222' },
          priority: 'LOW',
          impact: 'LOW',
          urgency: 'LOW',
          originUnitId: unit.id,
          serviceId: svc.id,
          formVersionId: form.id,
          requesterId: subject.id,
          status: 'CLOSED',
          closedAt: new Date(Date.now() - 300 * day),
          ...over,
        },
      });
    const main = await ticket('Štampač — Amra Hodžić');
    const held = await ticket('Sudski predmet Amra Hodžić', { legalHoldAt: new Date(), legalHoldReason: 'Spor u toku' });
    ids.main = main.id;
    ids.held = held.id;
    const agentMessage = await prisma.ticketMessage.create({
      data: { ticketId: main.id, type: 'AGENT_REPLY', body: 'Poštovana HODŽIĆ AMRA, riješeno.', authorUserId: agent.id },
    });
    ids.agentMessage = agentMessage.id;
    await prisma.ticketMessage.create({
      data: { ticketId: main.id, type: 'USER_REPLY', body: 'Hvala, Amra', authorUserId: subject.id },
    });
    await prisma.ticketParticipant.create({ data: { ticketId: main.id, userId: subject.id, role: 'FOLLOWER' } });
    await prisma.notification.create({
      data: { userId: agent.id, ticketId: main.id, type: 'TICKET_REPLY', title: 'Amra Hodžić je odgovorila', body: null, dedupeKey: `a${stamp}` },
    });
    const group = await prisma.group.create({ data: { name: `G${stamp}`, key: `g${stamp}`, organizationalUnitId: unit.id } });
    await prisma.notification.create({
      data: { groupId: group.id, ticketId: main.id, type: 'TICKET_REPLY', title: 'Grupa: Amra Hodžić', body: null, dedupeKey: `g${stamp}` },
    });
    await prisma.notification.create({
      data: { userId: subject.id, ticketId: main.id, type: 'TICKET_REPLY', title: 'Novi odgovor', body: null, dedupeKey: `s${stamp}` },
    });
    await prisma.userSession.create({ data: { userId: subject.id, provider: 'local', expiresAt: new Date(Date.now() + day) } });
    await prisma.manualDirectoryUser.create({
      data: { externalId: `m${stamp}`, login: `ahodzic${stamp}`, email, displayName: 'Amra Hodžić' },
    });
    mkdirSync(path.join(rawRoot, '2026-01'), { recursive: true });
    writeFileSync(path.join(rawRoot, rawKey), `From: ${email}`);
    await prisma.inboundEmail.create({
      data: {
        mailboxKey: 'm',
        providerMessageId: `p${stamp}`,
        fromAddress: email.toUpperCase(),
        subject: 'Upit od Amra Hodžić',
        status: 'PROCESSED',
        rawStorageKey: rawKey,
      },
    });
    await prisma.$transaction((tx) =>
      appendAuditLog(tx as never, {
        action: 'user.updated',
        entityType: 'user',
        entityId: subject.id,
        metadata: { email, displayName: 'Amra Hodžić' },
        actorUserId: admin.id,
      }),
    );
    const erasure = await prisma.privacyErasure.create({
      data: { userId: subject.id, pseudonym: 'Bivši korisnik #AB12', status: 'QUEUED', requestedByUserId: admin.id },
    });
    ids.erasure = erasure.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('lists the subject as a candidate and previews without writing', async () => {
    expect((await service.candidates()).map((c) => c.id)).toContain(ids.subject);
    const preview = await service.preview(ids.subject);
    expect(preview.ticketsInScope).toBe(2);
    expect(preview.ticketsOnLegalHold).toBe(1);
    expect(preview.textReplacements).toBeGreaterThanOrEqual(5);
    expect(preview.examples.join(' ')).not.toMatch(/Amra|Hodžić/i);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ids.main } });
    expect(ticket.title).toContain('Amra Hodžić');
  });

  it('executes: scrubs content, deletes personal rows, pseudonymises the user', async () => {
    const result = await service.execute(ids.erasure);
    expect(result?.status).toBe('COMPLETED');

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.subject } });
    expect(user.displayName).toBe('Bivši korisnik #AB12');
    expect(user.email).toMatch(/@anonymized\.invalid$/);
    expect(user.anonymizedAt).not.toBeNull();
    expect([user.directoryObjectGuid, user.distinguishedName, user.department, user.managerUserId]).toEqual([null, null, null, null]);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.agent } })).managerUserId).toBeNull();

    const main = await prisma.ticket.findUniqueOrThrow({ where: { id: ids.main } });
    expect(`${main.title} ${main.description} ${JSON.stringify(main.formData)}`).not.toMatch(/Amra Hodžić|ahodzic|amra\.hodzic/i);
    expect(main.description).toContain('Bivši korisnik #AB12');
    expect(main.formData).toEqual({ contact: 'Bivši korisnik #AB12', phone: '061 111 222' });
    // Legal hold: the ticket content stays untouched.
    const held = await prisma.ticket.findUniqueOrThrow({ where: { id: ids.held } });
    expect(held.title).toContain('Amra Hodžić');

    const message = await prisma.ticketMessage.findUniqueOrThrow({ where: { id: ids.agentMessage } });
    expect(message.body).toBe('Poštovana Bivši korisnik #AB12, riješeno.');
    expect(message.redactedAt).not.toBeNull();
    // A first name alone is not replaced (documented limitation).
    expect(await prisma.ticketMessage.count({ where: { ticketId: ids.main, body: 'Hvala, Amra' } })).toBe(1);

    const agentNotification = await prisma.notification.findFirstOrThrow({ where: { userId: ids.agent } });
    expect(agentNotification.title).toBe('Bivši korisnik #AB12 je odgovorila');
    expect(await prisma.notification.count({ where: { title: 'Grupa: Bivši korisnik #AB12' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: ids.subject } })).toBe(0);
    expect(await prisma.userSession.count({ where: { userId: ids.subject } })).toBe(0);
    expect(await prisma.ticketParticipant.count({ where: { userId: ids.subject } })).toBe(0);
    expect(await prisma.manualDirectoryUser.count({ where: { email } })).toBe(0);

    const inbound = await prisma.inboundEmail.findFirstOrThrow({ where: { providerMessageId: `p${stamp}` } });
    expect([inbound.fromAddress, inbound.rawStorageKey]).toEqual([null, null]);
    expect(inbound.subject).toBe('Upit od Bivši korisnik #AB12');
    expect(existsSync(path.join(rawRoot, rawKey))).toBe(false);

    const erasure = await prisma.privacyErasure.findUniqueOrThrow({ where: { id: ids.erasure } });
    expect(erasure.tombstones).toHaveLength(2);
    expect(JSON.stringify(erasure)).not.toMatch(/amra|hodžić|hodzic/i);
  });

  it('redacts audit metadata and the chain still verifies', async () => {
    const rows = await prisma.auditLog.findMany({ where: { entityId: ids.subject } });
    expect(JSON.stringify(rows.map((row) => row.metadata))).not.toMatch(/amra|hodžić|hodzic/i);
    expect(rows.some((row) => row.redactedAt !== null)).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'audit.redacted', entityId: ids.erasure } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'privacy.subject.anonymized', entityId: ids.subject } })).toBe(1);
    const records = (await prisma.auditLog.findMany()).sort(compareAuditLogChainOrder);
    const result = verifyAuditLogChain({ records: records as never, hashAlgorithm: defaultAuditHashAlgorithm });
    expect(result.valid).toBe(true);
    expect(result.checkedCount).toBe(records.length);
  });

  it('is idempotent and recognises a returning person', async () => {
    expect(await service.execute(ids.erasure)).toBeNull();
    await prisma.privacyErasure.update({ where: { id: ids.erasure }, data: { status: 'QUEUED' } });
    const again = await service.execute(ids.erasure);
    expect(again?.status).toBe('COMPLETED');
    const check = await loadReturningAnonymizedCheck(prisma as never);
    expect(check({ email: email.toUpperCase() })).toBe(true);
    expect(check({ guid: `guid-${stamp}` })).toBe(true);
    expect(check({ email: 'someone@else.ba' })).toBe(false);
  });

  it('refuses when a blocker appears before execution', async () => {
    const other = await prisma.user.create({ data: { email: `active${stamp}@x.ba`, displayName: 'Aktivan Korisnik' } });
    const erasure = await prisma.privacyErasure.create({
      data: { userId: other.id, pseudonym: 'Bivši korisnik #CD34', status: 'QUEUED', requestedByUserId: ids.admin },
    });
    const result = await service.execute(erasure.id);
    expect(result?.status).toBe('FAILED');
    expect(result?.error).toContain('blocked:active');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).displayName).toBe('Aktivan Korisnik');
  });
});
