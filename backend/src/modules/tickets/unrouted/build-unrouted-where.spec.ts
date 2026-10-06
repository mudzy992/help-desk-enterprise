import { buildUnroutedWhere } from './build-unrouted-where';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('buildUnroutedWhere (5.1.4 E2)', () => {
  it('matches status UNROUTED and fallback-routed PENDING without narrowing the target group', () => {
    expect(buildUnroutedWhere()).toEqual({
      OR: [
        { status: 'UNROUTED' },
        { status: 'PENDING', routedByUnroutedFallback: true },
      ],
    });
  });

  it('narrows the cleanup branch to unassigned tickets in the configured group', () => {
    expect(buildUnroutedWhere({ targetGroupId: 'group-unrouted' })).toEqual({
      OR: [
        { status: 'UNROUTED' },
        {
          status: 'PENDING',
          routedByUnroutedFallback: true,
          assignedGroupId: 'group-unrouted',
          assignedUserId: null,
        },
      ],
    });
  });

  it('omits the fallback branch when no target group is configured', () => {
    expect(buildUnroutedWhere({ targetGroupId: null })).toEqual({
      OR: [{ status: 'UNROUTED' }],
    });
  });
});
