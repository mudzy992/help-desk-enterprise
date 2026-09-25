import { listUsersSummary, resolveUserRoleTone, userListMaxTake } from './list-users-summary';

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
    expect(args.take).toBe(userListMaxTake);
    expect(args.skip).toBe(50);
  });
});
