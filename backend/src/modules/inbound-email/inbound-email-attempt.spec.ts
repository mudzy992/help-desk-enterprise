import {
  claimInboundEmailAttempt,
  normalizeInboundProviderMessageId,
} from './inbound-email-attempt';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('inbound provider message id normalization (BA-inbound-email-06)', () => {
  const longId = `graph-${'x'.repeat(600)}`;

  it('caps the durable identity at the 500 character column limit', () => {
    expect(normalizeInboundProviderMessageId(longId)).toBe(longId.slice(0, 500));
    expect(normalizeInboundProviderMessageId(longId)).toHaveLength(500);
    expect(normalizeInboundProviderMessageId('short-id')).toBe('short-id');
  });

  it('stores exactly the normalized identity the lookup uses', async () => {
    const create = jest.fn().mockImplementation(async ({ data }: { data: unknown }) => ({
      id: 'row-1',
      ...(data as Record<string, unknown>),
    }));
    const prisma = { inboundEmail: { create } };

    const claim = await claimInboundEmailAttempt(prisma as never, {
      mailboxKey: 'imap:support@example.test',
      providerMessageId: longId,
      existing: null,
      now: new Date('2026-10-30T00:00:00.000Z'),
      leaseMs: 60_000,
    });

    expect(claim).not.toBeNull();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerMessageId: normalizeInboundProviderMessageId(longId),
      }),
    });
  });
});
