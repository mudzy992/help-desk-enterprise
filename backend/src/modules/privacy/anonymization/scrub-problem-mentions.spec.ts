import type { PrismaService } from '../../../common/prisma/prisma.service';
import { scrubProblemMentions } from './scrub-problem-mentions';
import { createTextScrubber } from './text-scrubber';

/*
  W7.34 (BA-problems-16): a problem is not only the row a person created or
  owns — the text, the events, the in-app copies and the knowledge article it
  produced all have to follow the scrub, otherwise the erasure leaves the name
  behind in a place nobody looked at.
*/
describe('scrubProblemMentions', () => {
  const identifiers = {
    displayName: 'Amra Hodžić',
    email: 'amra.hodzic@example.com',
    logins: ['ahodzic'],
  };
  const replacement = 'Bivši korisnik #AAAA';

  function fakePrisma(overrides: Record<string, unknown> = {}) {
    const prisma = {
      problem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p1',
            title: 'Amra Hodžić ne može otvoriti VPN',
            description: 'Prijavila Amra Hodžić, kontakt amra.hodzic@example.com',
            rootCause: null,
            rcaWhys: ['Zato što je Amra Hodžić koristila stari profil'],
            workaround: null,
            resolution: null,
            cancelReason: null,
            knowledgeArticleId: 'a1',
          },
          {
            id: 'p2',
            title: 'Nema uticaja na korisnike',
            description: 'Servis radi.',
            rootCause: null,
            rcaWhys: null,
            workaround: null,
            resolution: null,
            cancelReason: null,
            knowledgeArticleId: null,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      problemEvent: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'e1' }])
          .mockResolvedValueOnce([{ id: 'e2' }])
          .mockResolvedValueOnce([
            { id: 'e1', detail: { note: 'Amra Hodžić je zvala' } },
            { id: 'e2', detail: { note: 'bez imena' } },
            { id: 'e3', detail: { note: 'ahodzic je potvrdio' } },
          ]),
        update: jest.fn().mockResolvedValue({}),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'n1', title: 'Amra Hodžić je dodana', body: null, payload: { problemId: 'p1' } },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      knowledgeArticle: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', title: 'VPN i Amra Hodžić', body: 'Koraci za Ahodzic.' },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'e3' }]),
      ...overrides,
    };
    return prisma;
  }

  const run = (prisma: ReturnType<typeof fakePrisma>) =>
    scrubProblemMentions({
      prisma: prisma as unknown as PrismaService,
      userId: 'u1',
      scrubber: createTextScrubber(identifiers, replacement),
      linkedTicketIds: ['t1'],
    });

  it('scrubs the problems it selected and skips the untouched ones', async () => {
    const prisma = fakePrisma();
    const counts = await run(prisma);

    expect(prisma.problem.update).toHaveBeenCalledTimes(1);
    const [call] = prisma.problem.update.mock.calls[0] as [{ where: { id: string }; data: Record<string, string> }];
    expect(call.where).toEqual({ id: 'p1' });
    expect(call.data.title).toBe(`${replacement} ne može otvoriti VPN`);
    expect(call.data.description).toContain(replacement);
    expect(call.data.rcaWhys).toEqual([`Zato što je ${replacement} koristila stari profil`]);
    expect(counts.problems).toBe(1);
  });

  it('selects by relationship *and* by mention, including the linked tickets', async () => {
    const prisma = fakePrisma();
    await run(prisma);
    const [call] = prisma.problem.findMany.mock.calls[0] as [{ where: { OR: unknown[] } }];
    const serialized = JSON.stringify(call.where);
    expect(serialized).toContain('"createdByUserId":"u1"');
    expect(serialized).toContain('"ownerUserId":"u1"');
    expect(serialized).toContain('"ticketId":{"in":["t1"]}');
    expect(serialized).toContain('"contains":"Amra Hodžić"');
  });

  it('scrubs event details of the person, of the selected problems and of mentions', async () => {
    const prisma = fakePrisma();
    const counts = await run(prisma);
    const updatedIds = (prisma.problemEvent.update.mock.calls as [{ where: { id: string } }][]).map(
      ([call]) => call.where.id,
    );
    expect(updatedIds.sort()).toEqual(['e1', 'e3']);
    expect(counts.problemEvents).toBe(2);
    const [payload] = prisma.problemEvent.update.mock.calls[0] as [{ data: { detail: { note: string } } }];
    expect(payload.data.detail.note).toBe(`${replacement} je zvala`);
  });

  it('scrubs the in-app copy so the inbox does not keep the name', async () => {
    const prisma = fakePrisma();
    const counts = await run(prisma);
    const [call] = prisma.notification.update.mock.calls[0] as [{ where: { id: string }; data: { title: string } }];
    expect(call.where).toEqual({ id: 'n1' });
    expect(call.data.title).toBe(`${replacement} je dodana`);
    expect(counts.problemNotifications).toBe(1);
  });

  it('scrubs the knowledge article a problem produced', async () => {
    const prisma = fakePrisma();
    const counts = await run(prisma);
    const [call] = prisma.knowledgeArticle.update.mock.calls[0] as [
      { where: { id: string }; data: { title: string; body: string } },
    ];
    expect(call.where).toEqual({ id: 'a1' });
    expect(call.data.title).toBe(`VPN i ${replacement}`);
    expect(call.data.body).toContain(replacement);
    expect(counts.knowledgeArticles).toBe(1);
  });

  it('reports nothing when the person does not appear anywhere', async () => {
    const prisma = fakePrisma({
      problem: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      problemEvent: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      notification: { findMany: jest.fn(), update: jest.fn() },
      knowledgeArticle: { findMany: jest.fn(), update: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
    });
    const counts = await run(prisma as ReturnType<typeof fakePrisma>);
    expect(counts).toEqual({ problems: 0, problemEvents: 0, problemNotifications: 0, knowledgeArticles: 0 });
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    expect(prisma.knowledgeArticle.findMany).not.toHaveBeenCalled();
  });
});
