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
import { auditLogActions, auditLogEntityTypes, defaultAuditHashAlgorithm } from '../../audit-log/audit-log.constants';
import { redactAuditForSubject } from './audit-redaction';
import { compareAuditLogChainOrder, verifyAuditLogChain } from '../../audit-log/verify-audit-log-chain';
import { InboundRawStore } from '../../inbound-email/inbound-raw-store';
import { DiskTicketAttachmentStorage } from '../../tickets/attachments/disk-ticket-attachment-storage';
import { AnonymizationService } from './anonymization.service';
import { loadReturningAnonymizedCheck } from './returning-anonymized';
import { ErasureLedger } from './erasure-ledger';
import { runPrivacyReplay } from '../../../cli/privacy-replay';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;
const day = 86_400_000;

describeIfDatabase('anonymization (integration)', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let service: AnonymizationService;
  let uploadRoot: string;
  let rawRoot: string;
  let ledger: ErasureLedger;
  const stamp = Date.now();
  const email = `amra.hodzic.${stamp}@example.com`;
  const rawKey = `2026-01/raw${stamp}.eml.gz`;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.PRIVACY_TOMBSTONE_KEY = 'integration-tombstone-key-0123456789';
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    uploadRoot = mkdtempSync(path.join(tmpdir(), 'anon-it-'));
    rawRoot = path.join(uploadRoot, 'inbound-raw');
    const loader = { load: async () => ({ enabled: true, candidateAfterDays: 180, requireSecondApprover: false, deleteOwnAttachmentsDefault: false }) };
    service = new AnonymizationService(
      prisma as never,
      loader as never,
      new DiskTicketAttachmentStorage(uploadRoot),
      new InboundRawStore(rawRoot),
      (ledger = new ErasureLedger(path.join(uploadRoot, 'privacy-ledger', 'erasures.jsonl'))),
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
    const transferStoragePath = `assets/transfers/anon-${stamp}/signed.pdf`;
    mkdirSync(path.join(uploadRoot, 'assets/transfers/anon-' + stamp), { recursive: true });
    writeFileSync(path.join(uploadRoot, transferStoragePath), 'signed binary');
    const transfer = await prisma.assetTransfer.create({
      data: {
        number: `ANON-${stamp}`,
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        sequence: 900_000_000 + (stamp % 1_000_000),
        scenario: 'WAREHOUSE_TO_USER',
        status: 'SIGNED',
        fromUserId: subject.id,
        toLabel: 'Skladište',
        signatoryUserId: subject.id,
        issuedByUserId: agent.id,
        signedByUserId: subject.id,
        fromLabel: 'Amra Hodžić',
        note: 'Za Amra Hodžić',
        signedAt: new Date(Date.now() - day),
        signedStoragePath: transferStoragePath,
        signedFileName: 'signed.pdf',
        signedMimeType: 'application/pdf',
        signedSizeBytes: Buffer.byteLength('signed binary'),
        snapshot: {
          version: 1,
          locale: 'bs',
          number: `ANON-${stamp}`,
          scenario: 'WAREHOUSE_TO_USER',
          issuedAt: new Date(Date.now() - day).toISOString(),
          timeZone: 'Europe/Sarajevo',
          place: 'Sarajevo',
          from: { userId: subject.id, name: 'Amra Hodžić', title: '', unit: 'IT', email },
          to: { userId: null, name: 'Skladište', title: '', unit: '', email: '' },
          signatory: { userId: subject.id, name: 'Amra Hodžić', title: '', unit: 'IT', email },
          issuedBy: { userId: agent.id, name: 'Edin Agent', title: '', unit: 'IT', email: agent.email },
          note: 'Za Amra Hodžić',
          items: [{ assetId: 'asset-reference', name: 'Laptop za Amru', assetTag: 'INV-1', serialNumber: 'SN-1', type: 'Laptop', manufacturer: 'Dell', model: 'XPS', location: 'IT', note: '' }],
        },
        items: { create: [{ position: 1, assetId: null }] },
      },
    });
    ids.transfer = transfer.id;
    ids.transferStoragePath = transferStoragePath;
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

    const transfer = await prisma.assetTransfer.findUniqueOrThrow({ where: { id: ids.transfer }, include: { items: true } });
    expect(transfer).toMatchObject({
      number: `ANON-${stamp}`,
      status: 'SIGNED',
      fromUserId: null,
      signatoryUserId: null,
      signedByUserId: null,
      fromLabel: 'Bivši korisnik #AB12',
      signedFilePurgeRequestedAt: expect.any(Date),
      signedStoragePath: null,
      signedFileName: null,
      signedMimeType: null,
      signedSizeBytes: null,
    });
    expect(transfer.snapshot).toMatchObject({
      from: { userId: null, name: 'Bivši korisnik #AB12', email: '' },
      signatory: { userId: null, name: 'Bivši korisnik #AB12', email: '' },
      note: 'Za Bivši korisnik #AB12',
    });
    expect(JSON.stringify(transfer.snapshot)).not.toMatch(/amra|hodžić|hodzic/i);
    expect(transfer.items).toHaveLength(1);
    expect(existsSync(path.join(uploadRoot, ids.transferStoragePath))).toBe(false);

    const erasure = await prisma.privacyErasure.findUniqueOrThrow({ where: { id: ids.erasure } });
    expect(erasure.tombstones).toHaveLength(2);
    expect(erasure.report).toMatchObject({
      assetTransfers: 1,
      assetTransferFilesQueued: 1,
    });
    expect((erasure.report as Record<string, unknown>).assetTransferTextReplacements).toBeGreaterThan(0);
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

  it('rolls every metadata update and summary event back on a mid-batch failure', async () => {
    const marker = `rollback-${stamp}@example.invalid`;
    const subjectId = `rollback-subject-${stamp}`;
    const erasureId = `rollback-erasure-${stamp}`;
    for (const index of [1, 2]) {
      await prisma.$transaction((transaction) => appendAuditLog(transaction as never, {
        action: auditLogActions.privacyRetentionRun,
        entityType: auditLogEntityTypes.retentionRun,
        entityId: subjectId,
        metadata: { marker, index },
        actorUserId: null,
      }));
    }
    let calls = 0;
    const scrubber = {
      scrub: (text: string) => ({ text, count: 0 }),
      scrubJson: (_value: unknown) => {
        calls += 1;
        if (calls === 2) throw new Error('simulated mid-batch failure');
        return { value: { redacted: true }, count: 1 };
      },
    };
    await expect(redactAuditForSubject(prisma as never, {
      userId: subjectId,
      email: marker,
      ticketIds: [],
      scrubber: scrubber as never,
      erasureId,
      actorUserId: null,
    })).rejects.toThrow('simulated mid-batch failure');
    const rows = await prisma.auditLog.findMany({ where: { entityId: subjectId } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.redactedAt === null && JSON.stringify(row.metadata).includes(marker))).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: auditLogActions.auditRedacted, entityId: erasureId } })).toBe(0);
    const chain = (await prisma.auditLog.findMany()).sort(compareAuditLogChainOrder);
    expect(verifyAuditLogChain({ records: chain as never, hashAlgorithm: defaultAuditHashAlgorithm }).valid).toBe(true);
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

  it('writes the ledger and replays an anonymization lost in a database restore (§12)', async () => {
    const { entries } = await ledger.read();
    const entry = entries.find((item) => item.userId === ids.subject)!;
    expect(entry).toMatchObject({ erasureId: ids.erasure, pseudonym: 'Bivši korisnik #AB12' });
    expect(entry.tombstones).toHaveLength(2);
    expect(JSON.stringify(entries)).not.toMatch(/amra|hodžić|hodzic/i);

    // "Restore" a backup taken before the erasure: the person is back, the erasure row is gone.
    await prisma.privacyErasure.delete({ where: { id: ids.erasure } });
    await prisma.user.update({
      where: { id: ids.subject },
      data: { displayName: 'Amra Hodžić', email, anonymizedAt: null },
    });
    await prisma.ticket.update({ where: { id: ids.main }, data: { title: 'Restored Amra Hodžić' } });

    const lines: string[] = [];
    expect(await runPrivacyReplay(prisma, ledger, { apply: false, exportLedger: false }, (l) => lines.push(l))).toBe(0);
    expect(lines).toContain(`replay erasure=${ids.erasure} user=${ids.subject}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.subject } })).anonymizedAt).toBeNull();

    expect(await runPrivacyReplay(prisma, ledger, { apply: true, exportLedger: false }, (l) => lines.push(l))).toBe(0);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.subject } });
    expect([user.displayName, user.anonymizedAt !== null]).toEqual(['Bivši korisnik #AB12', true]);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ids.main } })).title).toBe('Restored Bivši korisnik #AB12');
    expect((await prisma.privacyErasure.findUniqueOrThrow({ where: { id: ids.erasure } })).status).toBe('COMPLETED');

    // Second run: nothing left; export-ledger finds nothing missing.
    lines.length = 0;
    expect(await runPrivacyReplay(prisma, ledger, { apply: true, exportLedger: false }, (l) => lines.push(l))).toBe(0);
    expect(lines).toContain('to_replay=0');
    expect(await runPrivacyReplay(prisma, ledger, { apply: false, exportLedger: true }, (l) => lines.push(l))).toBe(0);
    expect(lines).toContain('export_ledger added=0');
  });
});
