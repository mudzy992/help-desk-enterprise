import { loadTicketDisplayLabels } from './load-ticket-display-labels';
import { toTicketLabelFields } from './ticket-label-fields';

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
