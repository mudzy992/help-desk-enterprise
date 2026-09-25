import {
  formatTicketNumber,
  nextTicketNumber,
  readHighestTicketSequence,
  withTicketNumberRetry,
} from './generate-ticket-number';

describe('nextTicketNumber', () => {
  it('continues after the highest number, not after the row count', async () => {
    // Two tickets left after a cleanup, the highest being T-100011.
    await expect(
      nextTicketNumber(
        async () => 2,
        async () => 100011,
      ),
    ).resolves.toBe(formatTicketNumber(100012));
  });

  it('falls back to the count when the highest cannot be read', async () => {
    await expect(
      nextTicketNumber(
        async () => 4,
        async () => null,
      ),
    ).resolves.toBe(formatTicketNumber(5));
    await expect(nextTicketNumber(async () => 0)).resolves.toBe(formatTicketNumber(1));
  });
});

describe('readHighestTicketSequence', () => {
  it('is null without raw SQL (in-memory client)', async () => {
    await expect(readHighestTicketSequence({})).resolves.toBeNull();
  });

  it('reads the MAX of the numeric suffix', async () => {
    const calls: unknown[][] = [];
    const client = {
      $queryRawUnsafe: async (...args: unknown[]) => {
        calls.push(args);
        return [{ highest: BigInt(42) }];
      },
    };
    await expect(readHighestTicketSequence(client)).resolves.toBe(42);
    expect(calls[0]?.slice(1)).toEqual([3, 'T-%']);
  });
});

describe('withTicketNumberRetry (review 2026-09-25)', () => {
  const collision = Object.assign(new Error('unique'), {
    code: 'P2002',
    meta: { target: ['ticketNumber'] },
  });
  it('re-runs the create when two creates took the same number', async () => {
    let calls = 0;
    const result = await withTicketNumberRetry(async () => {
      calls += 1;
      if (calls < 3) throw collision;
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });
  it('does not swallow other errors', async () => {
    await expect(
      withTicketNumberRetry(async () => {
        throw Object.assign(new Error('x'), { code: 'P2003' });
      }),
    ).rejects.toThrow('x');
  });
  it('gives up after the attempt limit', async () => {
    let calls = 0;
    await expect(
      withTicketNumberRetry(async () => {
        calls += 1;
        throw collision;
      }, 3),
    ).rejects.toBe(collision);
    expect(calls).toBe(3);
  });
});
