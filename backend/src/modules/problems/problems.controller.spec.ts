import { ProblemsController } from './problems.controller';

jest.mock('../privacy/privacy-actor', () => ({ privacyActorOf: () => ({ principal: { subjectId: 'u1' } }) }));
jest.mock('./problem-access.service', () => ({
  ProblemAccessService: class {},
  problemViewerOf: (_request: unknown, userId: string) => ({ userId, homeOrganizationalUnitId: null }),
}));

const ticketLinks = { linked: [{ ticketId: 't1', ticketNumber: 'T-1' }], skipped: [] };

describe('ProblemsController.create', () => {
  it('passes ticketIds to create so a viewer without a home unit gets the ticket unit (E2E 30 regression)', async () => {
    const problems = {
      create: jest.fn(async () => ({ id: 'p1', ticketLinks })),
      get: jest.fn(),
    };
    const tickets = { link: jest.fn() };
    const controller = new ProblemsController({} as never, problems as never, tickets as never, {} as never, {} as never, {} as never, {} as never);
    const body = { title: 'Mreža', description: 'x', groupId: 'g1', ticketIds: ['t1'] };
    const result = await controller.create({} as never, body as never);
    expect(problems.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }), expect.objectContaining({ ticketIds: ['t1'] }));
    // W7.26: the links belong to the create command itself, so the controller
    // neither links afterwards nor re-reads the problem.
    expect(tickets.link).not.toHaveBeenCalled();
    expect(problems.get).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'p1', ticketLinks });
  });

  it('returns the create result unchanged when no ticket was selected', async () => {
    const problems = { create: jest.fn(async () => ({ id: 'p2', ticketLinks: null })), get: jest.fn() };
    const tickets = { link: jest.fn() };
    const controller = new ProblemsController({} as never, problems as never, tickets as never, {} as never, {} as never, {} as never, {} as never);
    const result = await controller.create({} as never, { title: 'Mreža', description: 'x', groupId: 'g1' } as never);
    expect(result).toEqual({ id: 'p2', ticketLinks: null });
    expect(tickets.link).not.toHaveBeenCalled();
  });
});
