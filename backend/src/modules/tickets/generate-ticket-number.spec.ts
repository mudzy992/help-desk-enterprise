import {
  formatTicketNumber,
  nextTicketNumber,
  readHighestTicketSequence,
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
