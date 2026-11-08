import { claimInboundEmailAttempt } from './inbound-email-attempt';

const now = new Date('2026-10-29T12:00:00.000Z');
const leaseMs = 60_000;
const expired: Date = new Date(now.getTime() - 1_000);

function createPrisma(overrides: Record<string, unknown> = {}) {
  const inboundEmail = {
    create: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    ...overrides,
  };
  return { prisma: { inboundEmail } as never, inboundEmail };
}

describe('claimInboundEmailAttempt', () => {
  it('creates a leased processing row for a new provider message', async () => {
    const row = { id: 'inbound-row-01', processingOwnerToken: null };
    const { prisma, inboundEmail } = createPrisma({ create: jest.fn().mockResolvedValue(row) });

    const claim = await claimInboundEmailAttempt(prisma, {
      mailboxKey: 'imap:helpdesk@example.test',
      providerMessageId: 'provider-1',
      existing: null,
      now,
      leaseMs,
    });

    expect(claim).toMatchObject({ row, ownerToken: expect.any(String) });
    expect(inboundEmail.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mailboxKey: 'imap:helpdesk@example.test',
        providerMessageId: 'provider-1',
        status: 'PROCESSING',
        processingPhase: 'CLAIMED',
        processingLeaseExpiresAt: new Date(now.getTime() + leaseMs),
      }),
    });
  });

  it('does not steal a live PROCESSING lease', async () => {
    const { prisma, inboundEmail } = createPrisma();
    const result = await claimInboundEmailAttempt(prisma, {
      mailboxKey: 'imap:helpdesk@example.test',
      providerMessageId: 'provider-1',
      existing: {
        id: 'inbound-row-01',
        status: 'PROCESSING',
        attempts: 1,
        processingOwnerToken: '00000000-0000-4000-8000-000000000001',
        processingLeaseExpiresAt: new Date(now.getTime() + leaseMs),
      },
      now,
      leaseMs,
    });

    expect(result).toBeNull();
    expect(inboundEmail.updateMany).not.toHaveBeenCalled();
  });

  it('atomically reclaims one stale PROCESSING attempt and fences a concurrent claimant', async () => {
    const existing = {
      id: 'inbound-row-01',
      status: 'PROCESSING',
      attempts: 1,
      processingOwnerToken: '00000000-0000-4000-8000-000000000001',
      processingLeaseExpiresAt: expired,
    };
    let claimedToken: string | null = null;
    const { prisma, inboundEmail } = createPrisma({
      updateMany: jest.fn().mockImplementation(({ data }: { data: { processingOwnerToken: string } }) => {
        if (claimedToken !== null) return { count: 0 };
        claimedToken = data.processingOwnerToken;
        return { count: 1 };
      }),
      findUnique: jest.fn().mockImplementation(async () => ({ ...existing, processingOwnerToken: claimedToken })),
    });
    const input = {
      mailboxKey: 'imap:helpdesk@example.test',
      providerMessageId: 'provider-1',
      existing,
      now,
      leaseMs,
    };

    const results = await Promise.all([
      claimInboundEmailAttempt(prisma, input),
      claimInboundEmailAttempt(prisma, input),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(inboundEmail.updateMany).toHaveBeenCalledTimes(2);
    expect(inboundEmail.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ processingLeaseExpiresAt: { lte: now } }),
      data: expect.objectContaining({
        status: 'PROCESSING',
        attempts: { increment: 1 },
      }),
    }));
  });
});
