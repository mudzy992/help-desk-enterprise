import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { claimInboundEmailAttempt } from './inbound-email-attempt';
import { inboundEmailIdempotencyKey } from './inbound-email-idempotency';

const url = process.env.PRIVACY_IT_DATABASE_URL;
const describeIfDatabase = url ? describe : describe.skip;

describeIfDatabase('inbound email crash-safe attempt and ticket idempotency', () => {
  jest.setTimeout(120_000);
  let prisma: PrismaClient;
  let inboundEmailId: string;
  let ticketId: string;
  let actorId: string;
  let formVersionId: string;
  let serviceId: string;
  let categoryId: string;
  let unitId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const unit = await prisma.organizationalUnit.create({
      data: {
        name: `Inbound recovery ${stamp}`,
        type: 'DIRECTORATE',
        distinguishedName: `OU=INR${stamp}`,
        ouPath: `/inr${stamp}`,
      },
    });
    unitId = unit.id;
    const category = await prisma.serviceCategory.create({ data: { name: `Inbound recovery ${stamp}`, slug: `inr-cat-${stamp}` } });
    categoryId = category.id;
    const service = await prisma.service.create({
      data: { name: `Inbound recovery ${stamp}`, slug: `inr-svc-${stamp}`, categoryId, lifecycle: 'ACTIVE' },
    });
    serviceId = service.id;
    const form = await prisma.formVersion.create({ data: { serviceId, version: 1, schema: {} } });
    formVersionId = form.id;
    const actor = await prisma.user.create({ data: { email: `inbound-recovery-${stamp}@example.test`, displayName: 'Inbound recovery actor' } });
    actorId = actor.id;
    const inbound = await prisma.inboundEmail.create({
      data: {
        mailboxKey: `it:inbound-${stamp}`,
        providerMessageId: `provider-${stamp}`,
        subject: 'Crash recovery proof',
        status: 'PROCESSING',
        processingPhase: 'TICKET_WRITTEN',
        processingOwnerToken: '00000000-0000-4000-8000-000000000001',
        processingLeaseExpiresAt: new Date(Date.now() - 60_000),
      },
    });
    inboundEmailId = inbound.id;
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `INR-${stamp}`,
        sourceInboundEmailId: inboundEmailId,
        title: 'Inbound recovery',
        description: 'Exactly-once inbound result',
        formData: {},
        priority: 'LOW',
        impact: 'LOW',
        urgency: 'LOW',
        status: 'PENDING',
        serviceId,
        formVersionId,
        requesterId: actorId,
        originUnitId: unitId,
      } as never,
    });
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await prisma.ticket.delete({ where: { id: ticketId } }).catch(() => undefined);
    await prisma.inboundEmail.delete({ where: { id: inboundEmailId } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: actorId } }).catch(() => undefined);
    await prisma.formVersion.delete({ where: { id: formVersionId } }).catch(() => undefined);
    await prisma.service.delete({ where: { id: serviceId } }).catch(() => undefined);
    await prisma.serviceCategory.delete({ where: { id: categoryId } }).catch(() => undefined);
    await prisma.organizationalUnit.delete({ where: { id: unitId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('claims an expired PROCESSING attempt once and refreshes its owner lease', async () => {
    const existing = await prisma.inboundEmail.findUniqueOrThrow({ where: { id: inboundEmailId } });
    const now = new Date();
    const claim = await claimInboundEmailAttempt(prisma as never, {
      mailboxKey: existing.mailboxKey,
      providerMessageId: existing.providerMessageId,
      existing,
      now,
      leaseMs: 60_000,
    });
    expect(claim).not.toBeNull();
    expect(claim?.ownerToken).not.toBe(existing.processingOwnerToken);
    expect(claim?.row).toMatchObject({ status: 'PROCESSING', processingPhase: 'TICKET_WRITTEN', attempts: 2 });
    expect(claim?.row.processingLeaseExpiresAt?.getTime()).toBeGreaterThan(now.getTime());
    const staleOwnerCompletion = await prisma.inboundEmail.updateMany({
      where: {
        id: inboundEmailId,
        status: 'PROCESSING',
        processingOwnerToken: existing.processingOwnerToken,
        processingLeaseExpiresAt: { gt: now },
      },
      data: { status: 'PROCESSED' },
    });
    expect(staleOwnerCompletion.count).toBe(0);

    const winner = claim!;
    const expireWinner = await prisma.inboundEmail.updateMany({
      where: { id: inboundEmailId, status: 'PROCESSING', processingOwnerToken: winner.ownerToken },
      data: { processingLeaseExpiresAt: new Date(now.getTime() - 1) },
    });
    expect(expireWinner.count).toBe(1);
    const expiredOwnerCompletion = await prisma.inboundEmail.updateMany({
      where: {
        id: inboundEmailId,
        status: 'PROCESSING',
        processingOwnerToken: winner.ownerToken,
        processingLeaseExpiresAt: { gt: now },
      },
      data: { status: 'PROCESSED' },
    });
    expect(expiredOwnerCompletion.count).toBe(0);

    const expiredRow = await prisma.inboundEmail.findUniqueOrThrow({ where: { id: inboundEmailId } });
    const reclaimed = await claimInboundEmailAttempt(prisma as never, {
      mailboxKey: expiredRow.mailboxKey,
      providerMessageId: expiredRow.providerMessageId,
      existing: expiredRow,
      now,
      leaseMs: 60_000,
    });
    expect(reclaimed?.ownerToken).not.toBe(winner.ownerToken);
    const concurrent = await claimInboundEmailAttempt(prisma as never, {
      mailboxKey: expiredRow.mailboxKey,
      providerMessageId: expiredRow.providerMessageId,
      existing: reclaimed!.row,
      now,
      leaseMs: 60_000,
    });
    expect(concurrent).toBeNull();
  });

  it('enforces durable source, reply, and attachment idempotency keys', async () => {
    await expect(prisma.ticket.create({
      data: {
        ticketNumber: `INR-DUP-${stamp}`,
        sourceInboundEmailId: inboundEmailId,
        title: 'Duplicate inbound ticket',
        description: 'Must not be inserted twice',
        formData: {},
        priority: 'LOW',
        impact: 'LOW',
        urgency: 'LOW',
        status: 'PENDING',
        serviceId,
        formVersionId,
        requesterId: actorId,
        originUnitId: unitId,
      } as never,
    })).rejects.toMatchObject({ code: 'P2002' });

    const replyKey = inboundEmailIdempotencyKey(inboundEmailId, 'reply');
    await prisma.ticketMessage.create({
      data: { ticketId, type: 'USER_REPLY', body: 'One inbound reply', authorUserId: actorId, idempotencyKey: replyKey },
    });
    await expect(prisma.ticketMessage.create({
      data: { ticketId, type: 'USER_REPLY', body: 'One inbound reply', authorUserId: actorId, idempotencyKey: replyKey },
    })).rejects.toMatchObject({ code: 'P2002' });

    const attachmentKey = inboundEmailIdempotencyKey(inboundEmailId, 'attachment', 0);
    const attachment = {
      ticketId,
      storagePath: `tickets/${ticketId}/inbound-first.png`,
      originalName: 'proof.png',
      mimeType: 'image/png',
      extension: 'png',
      sizeBytes: 5,
      classification: 'INTERNAL' as const,
      uploadedByUserId: actorId,
      idempotencyKey: attachmentKey,
      payloadHash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    };
    await prisma.ticketAttachment.create({ data: attachment as never });
    await expect(prisma.ticketAttachment.create({
      data: { ...attachment, storagePath: `tickets/${ticketId}/inbound-second.png` } as never,
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows at most one PROCESSED row per Message-ID (BA-inbound-email-07)', async () => {
    const mailboxKey = `it:inbound-dedupe-${stamp}`;
    const messageIdHeader = `<dedupe-${stamp}@example.test>`;
    const first = await prisma.inboundEmail.create({
      data: { mailboxKey, providerMessageId: `dedupe-a-${stamp}`, subject: '', messageIdHeader, status: 'PROCESSING' },
    });
    const second = await prisma.inboundEmail.create({
      data: { mailboxKey, providerMessageId: `dedupe-b-${stamp}`, subject: '', messageIdHeader, status: 'PROCESSING' },
    });
    try {
      await prisma.inboundEmail.update({ where: { id: first.id }, data: { status: 'PROCESSED' } });
      await expect(
        prisma.inboundEmail.update({ where: { id: second.id }, data: { status: 'PROCESSED' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.inboundEmail.update({ where: { id: second.id }, data: { status: 'IGNORED', reason: 'DUPLICATE' } }),
      ).resolves.toMatchObject({ status: 'IGNORED' });
    } finally {
      await prisma.inboundEmail.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    }
  });
});
