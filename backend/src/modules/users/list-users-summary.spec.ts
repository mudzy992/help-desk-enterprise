import {
  listUsersSummary,
  listUsersSummaryPage,
  resolveUserMfaState,
  resolveUserRoleTone,
  userListMaxTake,
} from './list-users-summary';

type SummaryRow = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly isLocalOnly: boolean;
  readonly organizationalUnitId: string | null;
  readonly organizationalUnit: {
    readonly id: string;
    readonly name: string;
    readonly policyPack: { readonly key: string } | null;
  } | null;
  readonly userRoles: readonly unknown[];
  readonly groupMembers: readonly unknown[];
  readonly mfa: { readonly enabledAt: Date | null } | null;
  readonly anonymizedAt: Date | null;
  readonly legalHoldAt: Date | null;
  readonly _count: { readonly assignedTickets: number };
};

function summaryRow(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    id: 'u1',
    email: 'ana@example.com',
    displayName: 'Ana',
    isActive: true,
    isLocalOnly: true,
    organizationalUnitId: null,
    organizationalUnit: null,
    userRoles: [],
    groupMembers: [],
    mfa: null,
    anonymizedAt: null,
    legalHoldAt: null,
    _count: { assignedTickets: 0 },
    ...overrides,
  };
}

async function summarise(
  row: SummaryRow,
  options: Parameters<typeof listUsersSummary>[1] = {},
) {
  const findMany = jest.fn().mockResolvedValue([row]);
  const items = await listUsersSummary({ user: { findMany } } as never, options);
  return items[0];
}

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

describe('user summary MFA state and policy pack (paket 5.3.2, §4.4)', () => {
  it('reports MFA enabled/disabled for local accounts and n/a for directory accounts', () => {
    expect(resolveUserMfaState(true, new Date('2026-01-02T03:04:05Z'))).toBe('enabled');
    expect(resolveUserMfaState(true, null)).toBe('disabled');
    // Entra/AD accounts: the second factor belongs to the provider.
    expect(resolveUserMfaState(false, new Date('2026-01-02T03:04:05Z'))).toBe(
      'not_applicable',
    );
  });

  it('carries the MFA state in the summary without any secret', async () => {
    const enabled = await summarise(
      summaryRow({ mfa: { enabledAt: new Date('2026-01-02T03:04:05Z') } }),
    );
    expect(enabled?.mfa).toBe('enabled');
    expect(JSON.stringify(enabled)).not.toContain('secret');

    const directory = await summarise(
      summaryRow({
        isLocalOnly: false,
        mfa: { enabledAt: new Date('2026-01-02T03:04:05Z') },
      }),
    );
    expect(directory?.mfa).toBe('not_applicable');
  });

  it('marks a pack inherited from the organizational unit', async () => {
    const summary = await summarise(
      summaryRow({
        organizationalUnitId: 'ou1',
        organizationalUnit: {
          id: 'ou1',
          name: 'Direkcija',
          policyPack: { key: 'PACK_HR_RESTRICTED' },
        },
      }),
    );
    expect(summary?.policyPackKey).toBe('PACK_HR_RESTRICTED');
    expect(summary?.policyPackSource).toBe('organizational_unit');
    expect(summary?.policyPackDisabled).toBe(false);
  });

  it('does not treat a pack switched off in settings as active', async () => {
    const summary = await summarise(
      summaryRow({
        organizationalUnitId: 'ou1',
        organizationalUnit: {
          id: 'ou1',
          name: 'Direkcija',
          policyPack: { key: 'PACK_HR_RESTRICTED' },
        },
      }),
      { disabledPolicyPackKeys: [' pack_hr_restricted '] },
    );
    expect(summary?.policyPackDisabled).toBe(true);
  });

  it('reports no pack source when the unit has none', async () => {
    const summary = await summarise(
      summaryRow({
        organizationalUnitId: 'ou1',
        organizationalUnit: { id: 'ou1', name: 'Direkcija', policyPack: null },
      }),
    );
    expect(summary?.policyPackKey).toBeNull();
    expect(summary?.policyPackSource).toBe('none');
    expect(summary?.policyPackDisabled).toBe(false);
  });
});
