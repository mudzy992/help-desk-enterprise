import type { PrismaService } from '../../common/prisma/prisma.service';
import { lockTicketAssetPrimaryGroups } from './asset-ticket-primary-lock';

describe('lockTicketAssetPrimaryGroups', () => {
  it('deduplicates IDs and relies on database ordering before locking', async () => {
    const query = jest.fn(async (_strings: TemplateStringsArray, ids: string[]) =>
      [...ids].sort().map((id) => ({ id })),
    );
    const transaction = { $queryRaw: query } as unknown as Pick<PrismaService, '$queryRaw'>;

    const locked = await lockTicketAssetPrimaryGroups(transaction, ['ticket-z', 'ticket-a', 'ticket-z']);

    expect([...locked]).toEqual(['ticket-a', 'ticket-z']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual(['ticket-z', 'ticket-a']);
    expect(query.mock.calls[0]?.[0].join(' ')).toContain('ORDER BY "id"');
    expect(query.mock.calls[0]?.[0].join(' ')).toContain('FOR UPDATE');
  });

  it('does not open a database command for an empty ticket set', async () => {
    const query = jest.fn();
    const transaction = { $queryRaw: query } as unknown as Pick<PrismaService, '$queryRaw'>;

    await expect(lockTicketAssetPrimaryGroups(transaction, [])).resolves.toEqual(new Set());
    expect(query).not.toHaveBeenCalled();
  });
});
