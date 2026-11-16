import { redactProblemEventBody, redactProblemEventBodies } from './redact-problem-event-bodies';

jest.mock('../../common/principal-context/load-principal-context', () => ({ loadPrincipalContext: jest.fn() }));
jest.mock('../problems/problem-principal-scope', () => ({ problemPrincipalScope: jest.fn(async () => ({ id: { in: ['visible'] } })) }));

describe('problem ticket history redaction', () => {
  it('keeps details for readable problems and drops identity for hidden, malformed or other bodies', () => {
    const readable = new Set(['visible']);
    expect(redactProblemEventBody('ticket_problem_linked:visible|P-1 Title', readable)).toBe('ticket_problem_linked:visible|P-1 Title');
    expect(redactProblemEventBody('ticket_problem_linked:hidden|P-2 Secret', readable)).toBe('ticket_problem_linked');
    expect(redactProblemEventBody('ticket_problem_unlinked:', readable)).toBe('ticket_problem_unlinked');
    expect(redactProblemEventBody('ticket_priority_overridden:hidden|X', readable)).toBe('ticket_priority_overridden:hidden|X');
    expect(redactProblemEventBody('ticket_created', readable)).toBe('ticket_created');
  });

  it('resolves the readable set once and returns untouched records when no problem event exists', async () => {
    const prisma = { problem: { findMany: jest.fn(async () => [{ id: 'visible' }]) } };
    const records = await redactProblemEventBodies(prisma as never, 'u1', [
      { body: 'ticket_problem_takeover:hidden|P-2 Secret' },
      { body: 'ticket_problem_linked:visible|P-1' },
    ]);
    expect(records.map((record) => record.body)).toEqual(['ticket_problem_takeover', 'ticket_problem_linked:visible|P-1']);
    expect(prisma.problem.findMany).toHaveBeenCalledTimes(1);
    const plain = [{ body: 'ticket_created' }];
    await expect(redactProblemEventBodies(prisma as never, 'u1', plain)).resolves.toBe(plain);
    expect(prisma.problem.findMany).toHaveBeenCalledTimes(1);
  });
});
