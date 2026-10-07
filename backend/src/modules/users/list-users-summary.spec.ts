import {
  listUsersSummary,
  listUsersSummaryPage,
  resolveUserRoleTone,
  userListMaxTake,
} from './list-users-summary';

describe('resolveUserRoleTone', () => {
  it('maps system roles to reference tones', () => {
    expect(resolveUserRoleTone('SUPER_ADMIN')).toBe('super');
    expect(resolveUserRoleTone('ADMIN')).toBe('manager');
    expect(resolveUserRoleTone('AGENT')).toBe('agent');
    expect(resolveUserRoleTone('USER')).toBe('user');
    expect(resolveUserRoleTone(null)).toBe('user');
  });
});

describe('listUsersSummary options (review S3)', () => {
  const run = async (options: Parameters<typeof listUsersSummary>[1]) => {
    const findMany = jest.fn(async () => []);
    await listUsersSummary({ user: { findMany } } as never, options);
    return (findMany.mock.calls[0] as unknown as [Record<string, unknown>])[0];
  };

  it('returns the full list without options', async () => {
    const args = await run(undefined);
    expect(args.where).toEqual({});
    expect(args).not.toHaveProperty('take');
  });

  it('narrows to ids, searches, and caps take', async () => {
    const args = await run({ ids: ['u1'], query: ' ana ', take: 10_000, skip: 50 });
    expect(args.where).toMatchObject({ id: { in: ['u1'] } });
    expect(JSON.stringify(args.where)).toContain('"contains":"ana"');
    expect(args.where).toMatchObject({
      OR: expect.arrayContaining([
        { userRoles: { some: { role: { name: { contains: 'ana', mode: 'insensitive' } } } } },
      ]),
    });
    expect(args.take).toBe(userListMaxTake);
    expect(args.skip).toBe(50);
  });

  it('returns a total for the full filtered result while paging the array', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(1_204);
    const page = await listUsersSummaryPage(
      { user: { findMany, count } } as never,
      { query: 'person', take: 100, skip: 1_100 },
    );
    expect(page).toEqual({ items: [], total: 1_204 });
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ take: 100, skip: 1_100 });
    expect(count).toHaveBeenCalledWith({ where: findMany.mock.calls[0]?.[0].where });
  });

  it('caps a requested page size and defaults HTTP pagination to a bounded page', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    await listUsersSummaryPage({ user: { findMany, count } } as never, { take: 5_000 });
    expect(findMany.mock.calls[0]?.[0].take).toBe(userListMaxTake);
  });
});
