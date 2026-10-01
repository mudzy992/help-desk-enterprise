import { ProblemsController } from './problems.controller';

jest.mock('../privacy/privacy-actor', () => ({ privacyActorOf: () => ({ principal: { subjectId: 'u1' } }) }));
jest.mock('./problem-access.service', () => ({
  ProblemAccessService: class {},
  problemViewerOf: (_request: unknown, userId: string) => ({ userId, homeOrganizationalUnitId: null }),
}));

describe('ProblemsController.create', () => {
  it('passes ticketIds to create so a viewer without a home unit gets the ticket unit (E2E 30 regression)', async () => {
    const problems = {
      create: jest.fn(async () => ({ id: 'p1' })),
      get: jest.fn(async () => ({ id: 'p1', ticketCount: 1 })),
    };
    const tickets = { link: jest.fn(async () => ({ linked: ['t1'], skipped: [] })) };
    const controller = new ProblemsController({} as never, problems as never, tickets as never, {} as never, {} as never, {} as never);
    const body = { title: 'Mreža', description: 'x', groupId: 'g1', ticketIds: ['t1'] };
    const result = await controller.create({} as never, body as never);
    expect(problems.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }), expect.objectContaining({ ticketIds: ['t1'] }));
    expect(tickets.link).toHaveBeenCalledWith('p1', ['t1'], expect.anything(), { singleAsError: false });
    expect(result).toMatchObject({ id: 'p1', ticketLinks: { linked: ['t1'] } });
  });
});
