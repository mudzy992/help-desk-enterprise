import {
  formatTicketNumber,
  nextTicketNumber,
  readHighestTicketSequence,
  reserveTicketSequence,
  resyncTicketSequence,
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

describe('ticket number sequence (review S5)', () => {
  it('uses the reserved sequence value when available', async () => {
    const count = jest.fn(async () => 7);
    await expect(nextTicketNumber(count, async () => 7, 42)).resolves.toBe(
      formatTicketNumber(42),
    );
    expect(count).not.toHaveBeenCalled();
  });

  it('reserves via nextval and falls back to null when the sequence is missing', async () => {
    const ok = { $queryRawUnsafe: jest.fn(async (_query: string) => [{ value: BigInt(9) }]) };
    await expect(reserveTicketSequence(ok)).resolves.toBe(9);
    expect(ok.$queryRawUnsafe.mock.calls[0][0]).toContain("nextval('ticket_number_seq')");
    const missing = {
      $queryRawUnsafe: jest.fn(async () => {
        throw new Error('relation "ticket_number_seq" does not exist');
      }),
    };
    await expect(reserveTicketSequence(missing)).resolves.toBeNull();
    await expect(reserveTicketSequence({})).resolves.toBeNull();
  });

  it('resyncs the sequence after a collision before retrying', async () => {
    const onCollision = jest.fn(async () => undefined);
    let calls = 0;
    const result = await withTicketNumberRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw { code: 'P2002', meta: { target: ['ticketNumber'] } };
        return 'ok';
      },
      3,
      onCollision,
    );
    expect(result).toBe('ok');
    expect(onCollision).toHaveBeenCalledTimes(1);
  });

  it('setval moves past the highest existing number', async () => {
    const raw = jest
      .fn()
      .mockResolvedValueOnce([{ highest: BigInt(100) }])
      .mockResolvedValueOnce([]);
    await resyncTicketSequence({ $queryRawUnsafe: raw });
    expect(raw.mock.calls[1][0]).toContain("setval('ticket_number_seq'");
    expect(raw.mock.calls[1][1]).toBe(100);
  });
});
