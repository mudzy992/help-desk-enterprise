import { listGroupInboxTickets } from './list-group-inbox-tickets';

jest.mock('./load-ticket-visibility-inputs', () => ({
  loadTicketVisibilityInputs: jest.fn(async () => ({
    units: [],
    actorGroupIds: [],
  })),
}));

describe('listGroupInboxTickets totals cache', () => {
  const originalTtl = process.env.TICKET_LIST_TOTAL_CACHE_TTL_MS;

  beforeEach(() => {
    process.env.TICKET_LIST_TOTAL_CACHE_TTL_MS = '30000';
  });

  afterEach(() => {
    if (originalTtl === undefined) {
      delete process.env.TICKET_LIST_TOTAL_CACHE_TTL_MS;
    } else {
      process.env.TICKET_LIST_TOTAL_CACHE_TTL_MS = originalTtl;
    }
  });

  it('reuses only the visibility-matched count while always loading fresh rows', async () => {
    const records = [{ id: 'ticket-1' }];
    const findMany = jest.fn(async () => records);
    const count = jest.fn(async () => 5);
    const prisma = { ticket: { findMany, count } };
    const authorizationContextLoader = {
      loadBySubjectId: async (subjectId: string) => ({
        subjectId,
        isLocalOnly: false,
        isSuperAdmin: true,
        assignments: [],
      }),
    };
    const configurationLoader = {
      load: async () => ({ groupInboxEnabled: true }),
    };

    const first = await listGroupInboxTickets(
      prisma as never,
      authorizationContextLoader as never,
      configurationLoader as never,
      {
        actorUserId: 'admin-1',
        principalAuthzVersion: 0,
        principalGroupIds: ['group-1'],
      } as never,
      { page: 1, pageSize: 10 },
    );
    count.mockResolvedValue(8);
    const second = await listGroupInboxTickets(
      prisma as never,
      authorizationContextLoader as never,
      configurationLoader as never,
      {
        actorUserId: 'admin-1',
        principalAuthzVersion: 0,
        principalGroupIds: ['group-1'],
      } as never,
      { page: 2, pageSize: 10 },
    );
    const otherGroup = await listGroupInboxTickets(
      prisma as never,
      authorizationContextLoader as never,
      configurationLoader as never,
      {
        actorUserId: 'admin-1',
        principalAuthzVersion: 0,
        principalGroupIds: ['group-1'],
      } as never,
      { groupId: 'group-2', page: 1, pageSize: 10 },
    );
    const newAuthorizationVersion = await listGroupInboxTickets(
      prisma as never,
      authorizationContextLoader as never,
      configurationLoader as never,
      {
        actorUserId: 'admin-1',
        principalAuthzVersion: 1,
        principalGroupIds: ['group-1'],
      } as never,
      { page: 1, pageSize: 10 },
    );

    expect(first.total).toBe(5);
    expect(second.total).toBe(5);
    expect(second.totalsAsOf).toBe(first.totalsAsOf);
    expect(otherGroup.total).toBe(8);
    expect(newAuthorizationVersion.total).toBe(8);
    expect(findMany).toHaveBeenCalledTimes(4);
    expect(count).toHaveBeenCalledTimes(3);
  });
});
