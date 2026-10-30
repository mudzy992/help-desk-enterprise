import { loadTicketVisibilityInputs } from './load-ticket-visibility-inputs';

describe('loadTicketVisibilityInputs', () => {
  it('skips the group-id query when the caller uses a membership relation predicate', async () => {
    const findGroups = jest.fn();
    const prisma = {
      organizationalUnit: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ou-1', ouPath: '/BA' }]),
      },
      groupMember: { findMany: findGroups },
    };

    await expect(
      loadTicketVisibilityInputs(prisma as never, 'user-1', {
        includeActorGroupIds: false,
      }),
    ).resolves.toEqual({
      units: [{ id: 'ou-1', ouPath: '/BA' }],
      actorGroupIds: [],
    });
    expect(findGroups).not.toHaveBeenCalled();
  });
});
