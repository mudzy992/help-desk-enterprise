import { loadOnCallScheduleContext, loadActiveOnCallContexts } from './on-call-data';

const scheduleRow = {
  id: 'schedule-1',
  groupId: 'group-1',
  ownerUserId: null,
  timezone: 'Europe/Sarajevo',
  handoffMinute: 540,
  rotationLength: 'WEEK',
  rotationStartDate: '2026-01-05',
  isActive: true,
  autoAssignOutsideHours: true,
  members: [
    { userId: 'current-member', position: 0, user: { isActive: true, anonymizedAt: null } },
    { userId: 'former-member', position: 1, user: { isActive: true, anonymizedAt: null } },
    { userId: 'deactivated-member', position: 2, user: { isActive: false, anonymizedAt: null } },
  ],
};

function prismaFake() {
  return {
    onCallSchedule: {
      findUnique: jest.fn().mockResolvedValue(scheduleRow),
      findMany: jest.fn().mockResolvedValue([scheduleRow]),
    },
    onCallOverride: { findMany: jest.fn().mockResolvedValue([]) },
    groupMember: {
      findMany: jest.fn().mockResolvedValue([
        { groupId: 'group-1', userId: 'current-member' },
        { groupId: 'group-1', userId: 'deactivated-member' },
        { groupId: 'group-2', userId: 'former-member' },
      ]),
    },
  };
}

describe('on-call data loader membership availability (BA-on-call-04)', () => {
  const window = { from: new Date('2026-01-05T00:00:00Z'), to: new Date('2026-01-06T00:00:00Z') };

  it('marks a former group member unavailable even when the user stays active', async () => {
    const prisma = prismaFake();
    const context = await loadOnCallScheduleContext(prisma as never, 'group-1', window);
    expect(context?.members).toEqual([
      { userId: 'current-member', position: 0, isAvailable: true },
      { userId: 'former-member', position: 1, isAvailable: false },
      { userId: 'deactivated-member', position: 2, isAvailable: false },
    ]);
    expect(prisma.groupMember.findMany).toHaveBeenCalledWith({
      where: {
        groupId: { in: ['group-1'] },
        userId: { in: ['current-member', 'former-member', 'deactivated-member'] },
      },
      select: { groupId: true, userId: true },
    });
  });

  it('applies the same membership check to bulk active contexts', async () => {
    const prisma = prismaFake();
    const contexts = await loadActiveOnCallContexts(prisma as never, window);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.members.find((member) => member.userId === 'former-member')?.isAvailable).toBe(false);
    expect(contexts[0]?.members.find((member) => member.userId === 'current-member')?.isAvailable).toBe(true);
  });
});
