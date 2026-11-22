import { createTextScrubber } from './text-scrubber';
import { scrubKnowledgeMentions } from './scrub-knowledge-mentions';

/*
  W7.87 (BA-knowledge-base-14): an anonymisation used to touch one knowledge
  table — the person's own feedback comments. An article they own or are only
  named in, somebody else's comment about them, the notification copy, the
  change-log snapshot, the source pointer into their ticket and their intercept
  history all kept the name. This spec pins every reader the scrubber now
  reaches, and the split between "their own words are removed" and "other
  people's words are scrubbed".
*/
describe('scrubKnowledgeMentions', () => {
  const userId = 'u1';
  const identifiers = {
    displayName: 'Amra Petrović',
    email: 'amra.petrovic@example.ba',
    logins: ['apetrovic'],
  };
  const scrubber = createTextScrubber(identifiers, 'Bivši korisnik #3');

  function fakePrisma(input?: {
    articles?: unknown[];
    feedbacks?: unknown[];
    notifications?: unknown[];
    changeLogs?: unknown[];
    sourced?: unknown[];
    intercepts?: number;
  }) {
    return {
      knowledgeArticle: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(input?.articles ?? [])
          .mockResolvedValueOnce(input?.sourced ?? []),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: (input?.sourced ?? []).length }),
      },
      knowledgeFeedback: {
        findMany: jest.fn().mockResolvedValue(input?.feedbacks ?? []),
        update: jest.fn().mockResolvedValue({}),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue(input?.notifications ?? []),
        update: jest.fn().mockResolvedValue({}),
      },
      changeLog: {
        findMany: jest.fn().mockResolvedValue(input?.changeLogs ?? []),
        update: jest.fn().mockResolvedValue({}),
      },
      knowledgeInterceptResolution: {
        deleteMany: jest.fn().mockResolvedValue({ count: input?.intercepts ?? 0 }),
      },
    };
  }

  it('scrubs the title and body of an article the person owns or is named in', async () => {
    const prisma = fakePrisma({
      articles: [
        { id: 'a1', title: 'VPN za Amra Petrović', body: 'Pošaljite upit na amra.petrovic@example.ba.' },
        { id: 'a2', title: 'Lozinke', body: 'Bez ličnih podataka.' },
      ],
    });

    const counts = await scrubKnowledgeMentions({
      prisma: prisma as never,
      userId,
      scrubber,
      linkedTicketIds: [],
    });

    expect(counts.knowledgeArticles).toBe(1);
    expect(prisma.knowledgeArticle.update).toHaveBeenCalledTimes(1);
    const [call] = prisma.knowledgeArticle.update.mock.calls[0] as [
      { where: { id: string }; data: { title: string; body: string } },
    ];
    expect(call.where.id).toBe('a1');
    expect(call.data.title).not.toContain('Amra Petrović');
    expect(call.data.body).not.toContain('amra.petrovic@example.ba');
  });

  it('removes their own comments and scrubs somebody else’s comment about them', async () => {
    const prisma = fakePrisma({
      feedbacks: [
        { id: 'f1', comment: 'Nedostaje mi primjer.', userId },
        { id: 'f2', comment: 'Ovo je pisala Amra Petrović, provjeriti.', userId: 'other' },
      ],
    });

    const counts = await scrubKnowledgeMentions({
      prisma: prisma as never,
      userId,
      scrubber,
      linkedTicketIds: [],
    });

    expect(counts.knowledgeFeedbacks).toBe(2);
    const [own] = prisma.knowledgeFeedback.update.mock.calls[0] as [
      { where: { id: string }; data: { comment: string | null } },
    ];
    expect(own.where.id).toBe('f1');
    expect(own.data.comment).toBeNull();
    const [foreign] = prisma.knowledgeFeedback.update.mock.calls[1] as [
      { where: { id: string }; data: { comment: string | null } },
    ];
    expect(foreign.where.id).toBe('f2');
    expect(foreign.data.comment).not.toContain('Amra Petrović');
  });

  it('scrubs the notifications that copied the article and the change-log snapshots', async () => {
    const prisma = fakePrisma({
      articles: [{ id: 'a1', title: 'VPN', body: 'Uputstvo.' }],
      notifications: [
        {
          id: 'n1',
          title: 'knowledge.review.due',
          body: 'Amra Petrović, pregledajte članak.',
          payload: { articleId: 'a1', articleSlug: 'vpn', ticketId: null },
        },
      ],
      changeLogs: [
        {
          id: 'c1',
          reason: 'Ažuriranje za Amra Petrović',
          diff: { before: { title: 'VPN za Amra Petrović' }, after: { title: 'VPN' } },
        },
      ],
    });

    const counts = await scrubKnowledgeMentions({
      prisma: prisma as never,
      userId,
      scrubber,
      linkedTicketIds: [],
    });

    expect(counts.knowledgeNotifications).toBe(1);
    const [notification] = prisma.notification.update.mock.calls[0] as [
      { data: { title: string; body: string | null } },
    ];
    expect(notification.data.body).not.toContain('Amra Petrović');
    expect(counts.knowledgeChangeLogs).toBe(1);
    const [log] = prisma.changeLog.update.mock.calls[0] as [
      { data: { reason: string; diff?: unknown } },
    ];
    expect(log.data.reason).not.toContain('Amra Petrović');
    expect(JSON.stringify(log.data.diff)).not.toContain('Amra Petrović');
  });

  it('clears the source pointer into the person’s ticket and their intercept history', async () => {
    const prisma = fakePrisma({
      sourced: [{ id: 'a3' }],
      intercepts: 4,
    });

    const counts = await scrubKnowledgeMentions({
      prisma: prisma as never,
      userId,
      scrubber,
      linkedTicketIds: ['t1', 't2'],
    });

    const sourcedCall = prisma.knowledgeArticle.findMany.mock.calls[1] as [
      { where: { sourceTicketId: { in: string[] } } },
    ];
    expect(sourcedCall[0].where.sourceTicketId.in).toEqual(['t1', 't2']);
    expect(prisma.knowledgeArticle.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a3'] } },
      data: { sourceTicketId: null, sourceMessageId: null },
    });
    expect(counts.knowledgeSourceLinks).toBe(1);
    expect(prisma.knowledgeInterceptResolution.deleteMany).toHaveBeenCalledWith({
      where: { userId },
    });
    expect(counts.knowledgeIntercepts).toBe(4);
  });

  it('returns zero counts when nothing carries the person’s data', async () => {
    const prisma = fakePrisma({
      articles: [{ id: 'a1', title: 'Lozinke', body: 'Bez ličnih podataka.' }],
    });

    const counts = await scrubKnowledgeMentions({
      prisma: prisma as never,
      userId,
      scrubber,
      linkedTicketIds: [],
    });

    expect(counts).toEqual({
      knowledgeArticles: 0,
      knowledgeFeedbacks: 0,
      knowledgeNotifications: 0,
      knowledgeChangeLogs: 0,
      knowledgeSourceLinks: 0,
      knowledgeIntercepts: 0,
    });
    expect(prisma.knowledgeArticle.update).not.toHaveBeenCalled();
  });
});
