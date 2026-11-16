import { problemTicketVisibility } from './problem-ticket-visibility';
import { loadTicketVisibilityInputs } from '../tickets/list/load-ticket-visibility-inputs';
import { buildTicketSurfaceVisibility } from '../tickets/list/build-ticket-surface-visibility';

jest.mock('../tickets/list/load-ticket-visibility-inputs', () => ({ loadTicketVisibilityInputs: jest.fn() }));
jest.mock('../tickets/list/build-ticket-surface-visibility', () => ({ buildTicketSurfaceVisibility: jest.fn() }));

describe('problemTicketVisibility', () => {
  it('uses the canonical list policy and the current confidential configuration', async () => {
    const context = { subjectId: 'u1' };
    const configuration = { enabled: true, allowedViewerGroupIds: ['g1'] };
    const prisma = {};
    const loader = { loadBySubjectId: jest.fn(async () => context) };
    const policies = { bind: jest.fn(async () => ({ confidential: configuration })) };
    (loadTicketVisibilityInputs as jest.Mock).mockResolvedValue({ units: [], actorGroupIds: ['g1'] });
    (buildTicketSurfaceVisibility as jest.Mock).mockReturnValue({ id: 'visible' });
    await expect(problemTicketVisibility(prisma as never, loader as never, policies as never, 'u1')).resolves.toEqual({ id: 'visible' });
    expect(loadTicketVisibilityInputs).toHaveBeenCalledWith(prisma, 'u1', { includeActorGroupIds: true });
    expect(buildTicketSurfaceVisibility).toHaveBeenCalledWith({ surface: 'list', visibility: expect.objectContaining({
      context, configuration, actorMembershipUserId: 'u1', actorGroupIds: ['g1'], now: expect.any(Date),
    }) });
  });

  it('fails closed when authorization context is absent', async () => {
    const loader = { loadBySubjectId: jest.fn(async () => null) };
    const policies = { bind: jest.fn(async () => ({ confidential: {} })) };
    await expect(problemTicketVisibility({} as never, loader as never, policies as never, 'u1')).rejects.toThrow();
  });
});
