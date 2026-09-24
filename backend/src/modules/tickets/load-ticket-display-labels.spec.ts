import { loadTicketDisplayLabels } from './load-ticket-display-labels';
import { toTicketLabelFields } from './ticket-label-fields';
import type {
  TicketLabelCache,
  TicketLabelCacheEntry,
  TicketLabelKind,
  TicketLabelRow,
} from './labels/ticket-label-cache';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type Ids = { where: { id: { in: string[] } } };

function createPrismaStub() {
  const find = (rows: readonly Record<string, unknown>[]) =>
    jest.fn(async ({ where }: Ids) =>
      rows.filter((row) => where.id.in.includes(row.id as string)),
    );
  const stub = {
    user: {
      findMany: find([
        { id: 'u-req', displayName: 'Ana Requester' },
        { id: 'u-agent', displayName: 'Agent Ago' },
      ]),
    },
    group: { findMany: find([{ id: 'g-it', name: 'IT podrška' }]) },
    formVersion: { findMany: find([{ id: 'fv-1', version: 3 }]) },
    organizationalUnit: {
      findMany: find([
        { id: 'ou-it', name: 'IT', ouPath: '/Korisnici/IT' },
        { id: 'ou-hr', name: 'HR', ouPath: '/Korisnici/HR' },
      ]),
    },
    service: { findMany: find([{ id: 's-vpn', name: 'VPN pristup' }]) },
  };
  return stub;
}

/**
 * The cache contract in memory: `read` answers for what a previous call stored,
 * `write` records rows and the absence of a row. The stub prisma below counts
 * its calls, so "the second request does not touch the database" is an assertion
 * and not a hope.
 */
function createLabelCache(): TicketLabelCache & {
  readonly store: Map<string, TicketLabelRow | null>;
} {
  const store = new Map<string, TicketLabelRow | null>();
  const key = (kind: TicketLabelKind, id: string) => `${kind}:${id}`;
  return {
    store,
    read: jest.fn(async (kind, ids) => {
      const hits = new Map<string, TicketLabelRow | null>();
      for (const id of ids) {
        const stored = store.get(key(kind, id));
        if (store.has(key(kind, id))) {
          hits.set(id, stored ?? null);
        }
      }
      return hits;
    }),
    write: jest.fn(async (kind, entries: readonly TicketLabelCacheEntry[]) => {
      for (const entry of entries) {
        store.set(key(kind, entry.id), entry.row);
      }
    }),
  };
}

const base = {
  requesterId: 'u-req',
  assignedUserId: null,
  assignedGroupId: null,
  formVersionId: 'fv-1',
  originUnitId: 'ou-it',
  serviceId: 's-vpn',
} as const;

describe('loadTicketDisplayLabels', () => {
  it('resolves origin unit and service names with one query per kind', async () => {
    const prisma = createPrismaStub();
    const records = [
      base,
      { ...base, originUnitId: 'ou-hr', assignedUserId: 'u-agent', assignedGroupId: 'g-it' },
      { ...base },
    ];
    const labels = await loadTicketDisplayLabels(prisma as never, records);
    for (const delegate of Object.values(prisma)) {
      expect(delegate.findMany).toHaveBeenCalledTimes(1);
    }
    expect(prisma.organizationalUnit.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['ou-it', 'ou-hr'] } },
      select: { id: true, name: true, ouPath: true },
    });
    expect(labels.originUnits.get('ou-hr')).toEqual({
      name: 'HR',
      path: '/Korisnici/HR',
    });
    expect(labels.services.get('s-vpn')).toBe('VPN pristup');
  });

  it('skips the lookup for kinds the result set does not reference', async () => {
    const prisma = createPrismaStub();
    await loadTicketDisplayLabels(prisma as never, [base]);
    expect(prisma.group.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
  });

  it('issues no queries at all for an empty result set', async () => {
    const prisma = createPrismaStub();
    await loadTicketDisplayLabels(prisma as never, []);
    for (const delegate of Object.values(prisma)) {
      expect(delegate.findMany).not.toHaveBeenCalled();
    }
  });
});

describe('loadTicketDisplayLabels with a cache', () => {
  it('reads the catalogues once, then answers from the cache', async () => {
    const prisma = createPrismaStub();
    const cache = createLabelCache();
    const records = [
      base,
      { ...base, assignedUserId: 'u-agent', assignedGroupId: 'g-it' },
    ];

    const first = await loadTicketDisplayLabels(prisma as never, records, cache);
    const second = await loadTicketDisplayLabels(prisma as never, records, cache);

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.group.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.service.findMany).toHaveBeenCalledTimes(1);
    expect(second.services.get('s-vpn')).toBe(first.services.get('s-vpn'));
    expect(second.users.get('u-agent')).toBe('Agent Ago');
  });

  it('remembers ids that do not exist instead of asking again', async () => {
    const prisma = createPrismaStub();
    const cache = createLabelCache();
    const records = [{ ...base, requesterId: 'u-gone', serviceId: 's-gone' }];

    const first = await loadTicketDisplayLabels(prisma as never, records, cache);
    const second = await loadTicketDisplayLabels(prisma as never, records, cache);

    expect(first.users.size).toBe(0);
    expect(second.users.size).toBe(0);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.service.findMany).toHaveBeenCalledTimes(1);
    expect(cache.store.get('user:u-gone')).toBeNull();
  });

  it('asks only for the ids the cache does not know', async () => {
    const prisma = createPrismaStub();
    const cache = createLabelCache();
    await loadTicketDisplayLabels(prisma as never, [base], cache);

    await loadTicketDisplayLabels(
      prisma as never,
      [{ ...base, originUnitId: 'ou-hr' }],
      cache,
    );

    expect(prisma.organizationalUnit.findMany).toHaveBeenLastCalledWith({
      where: { id: { in: ['ou-hr'] } },
      select: { id: true, name: true, ouPath: true },
    });
  });

  it('behaves exactly as before when the cache is absent', async () => {
    const prisma = createPrismaStub();
    const labels = await loadTicketDisplayLabels(prisma as never, [base], undefined);
    expect(labels.services.get('s-vpn')).toBe('VPN pristup');
    expect(prisma.service.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps the order of the ids it was asked about', async () => {
    const prisma = createPrismaStub();
    const cache = createLabelCache();
    const records = [
      { ...base, originUnitId: 'ou-hr' },
      { ...base, originUnitId: 'ou-it' },
    ];
    const labels = await loadTicketDisplayLabels(prisma as never, records, cache);
    expect(prisma.organizationalUnit.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['ou-hr', 'ou-it'] } },
      select: { id: true, name: true, ouPath: true },
    });
    expect([...labels.originUnits.keys()]).toEqual(['ou-hr', 'ou-it']);
  });
});

describe('toTicketLabelFields', () => {
  it('returns names and the origin unit path, never ids', async () => {
    const labels = await loadTicketDisplayLabels(createPrismaStub() as never, [
      base,
    ]);
    expect(toTicketLabelFields(base, labels)).toEqual({
      requesterName: 'Ana Requester',
      assignedUserName: null,
      assignedGroupName: null,
      formVersionNumber: 3,
      originUnitName: 'IT',
      originUnitPath: '/Korisnici/IT',
      serviceName: 'VPN pristup',
    });
  });

  it('falls back to null for ids that no longer resolve', async () => {
    const labels = await loadTicketDisplayLabels(createPrismaStub() as never, []);
    const fields = toTicketLabelFields(
      { ...base, originUnitId: 'gone', serviceId: 'gone', requesterId: 'gone' },
      labels,
    );
    expect(fields.originUnitName).toBeNull();
    expect(fields.originUnitPath).toBeNull();
    expect(fields.serviceName).toBeNull();
    expect(fields.requesterName).toBeNull();
  });
});
