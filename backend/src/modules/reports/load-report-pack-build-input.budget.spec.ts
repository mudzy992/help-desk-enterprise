import { publishedArticleSeed } from '../knowledge-base/published-article-seed';
import { ticketsTestIds } from '../tickets/tickets-test-ids';
import { createReportsServiceHarness } from './create-reports-service-harness';
import { loadReportPackBuildInput } from './load-report-pack-build-input';
import { reportTicketSeed } from './report-ticket-seed';
import { reportPackKeys } from './reports.constants';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/**
 * W7.53 (BA-reports-01): every pack load is bounded *before* the build sees the
 * data — one row budget per caller, a probe row that only flags truncation, and
 * a narrow projection for the knowledge base. These specs pin that contract.
 */
describe('report pack load budget', () => {
  const units = [ticketsTestIds.ouIt, 'ou-it-ops'] as const;
  const window = {
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-09-30T23:59:59.000Z'),
  };

  function seedTicket(
    harness: ReturnType<typeof createReportsServiceHarness>,
    id: string,
    originUnitId: string,
  ): void {
    harness.memory.tickets.set(
      id,
      reportTicketSeed({ id, originUnitId, status: 'UNROUTED' }),
    );
  }

  it('caps scoped tickets at the row budget and reports the truncation', async () => {
    const harness = createReportsServiceHarness();
    seedTicket(harness, 't-1', ticketsTestIds.ouIt);
    seedTicket(harness, 't-2', 'ou-it-ops');
    seedTicket(harness, 't-3', ticketsTestIds.ouIt);
    seedTicket(harness, 't-sibling', ticketsTestIds.ouHr);

    const loaded = await loadReportPackBuildInput(
      harness.prisma as never,
      [...units],
      window,
      reportPackKeys.monthlyKpi,
      3,
      undefined,
      { rowLimit: 2 },
    );

    expect(loaded.input.tickets).toHaveLength(2);
    expect(loaded.truncatedInput).toBe(true);
    expect(loaded.input.tickets.map((ticket) => ticket.id)).not.toContain(
      't-sibling',
    );
  });

  it('does not flag truncation when the corpus fits the budget exactly', async () => {
    const harness = createReportsServiceHarness();
    seedTicket(harness, 't-1', ticketsTestIds.ouIt);
    seedTicket(harness, 't-2', 'ou-it-ops');
    seedTicket(harness, 't-3', ticketsTestIds.ouIt);

    const loaded = await loadReportPackBuildInput(
      harness.prisma as never,
      [...units],
      window,
      reportPackKeys.monthlyKpi,
      3,
      undefined,
      { rowLimit: 3 },
    );

    expect(loaded.input.tickets).toHaveLength(3);
    expect(loaded.truncatedInput).toBe(false);
  });

  it('reads only budget + 1 rows from the database', async () => {
    const harness = createReportsServiceHarness();
    seedTicket(harness, 't-1', ticketsTestIds.ouIt);
    const spy = jest.spyOn(harness.prisma.ticket, 'findMany');

    await loadReportPackBuildInput(
      harness.prisma as never,
      [...units],
      window,
      reportPackKeys.monthlyKpi,
      3,
      undefined,
      { rowLimit: 5 },
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0][0] as { take?: number }).take).toBe(6);
  });

  it('reads knowledge base articles through a narrow projection without body', async () => {
    const harness = createReportsServiceHarness();
    harness.articles.set(
      'kb-a',
      publishedArticleSeed({ id: 'kb-a', organizationalUnitId: ticketsTestIds.ouIt }),
    );
    harness.articles.set(
      'kb-b',
      publishedArticleSeed({ id: 'kb-b', organizationalUnitId: 'ou-it-ops' }),
    );
    harness.articles.set(
      'kb-sibling',
      publishedArticleSeed({ id: 'kb-sibling', organizationalUnitId: ticketsTestIds.ouHr }),
    );
    const spy = jest.spyOn(harness.prisma.knowledgeArticle, 'findMany');

    const loaded = await loadReportPackBuildInput(
      harness.prisma as never,
      [...units],
      window,
      reportPackKeys.kbHelpfulness,
      3,
      undefined,
      { rowLimit: 1 },
    );

    expect(loaded.input.articles.map((article) => article.id)).toEqual(['kb-a']);
    expect(loaded.truncatedInput).toBe(true);
    for (const article of loaded.input.articles) {
      expect(Object.keys(article).sort()).toEqual([
        'id',
        'organizationalUnitId',
        'serviceId',
        'title',
        'viewCount',
      ]);
    }
    const args = spy.mock.calls[0][0] as {
      take?: number;
      select?: Record<string, boolean>;
    };
    expect(args.take).toBe(2);
    expect(args.select).toBeDefined();
    expect(args.select).not.toHaveProperty('body');
  });

  it('keeps knowledge base votes scoped to the loaded articles and the window', async () => {
    const harness = createReportsServiceHarness();
    harness.articles.set(
      'kb-a',
      publishedArticleSeed({ id: 'kb-a', organizationalUnitId: ticketsTestIds.ouIt }),
    );
    const inWindow = new Date('2026-09-10T09:00:00.000Z');
    const beforeWindow = new Date('2026-08-10T09:00:00.000Z');
    const vote = (
      id: string,
      articleId: string,
      createdAt: Date,
    ): void => {
      harness.feedbacks.set(id, {
        id,
        articleId,
        userId: 'user-1',
        isHelpful: true,
        rating: 5,
        createdAt,
        updatedAt: createdAt,
      });
    };
    vote('v-in', 'kb-a', inWindow);
    vote('v-old', 'kb-a', beforeWindow);
    vote('v-other', 'kb-other', inWindow);

    const loaded = await loadReportPackBuildInput(
      harness.prisma as never,
      [...units],
      window,
      reportPackKeys.kbHelpfulness,
      3,
    );

    expect(loaded.input.articles.map((article) => article.id)).toEqual(['kb-a']);
    expect(loaded.input.feedback.map((entry) => entry.articleId)).toEqual(['kb-a']);
    expect(loaded.truncatedInput).toBe(false);
  });

  it('leaves the corpus untouched when no budget is given', async () => {
    const harness = createReportsServiceHarness();
    seedTicket(harness, 't-1', ticketsTestIds.ouIt);
    seedTicket(harness, 't-2', 'ou-it-ops');

    const loaded = await loadReportPackBuildInput(
      harness.prisma as never,
      [...units],
      window,
      reportPackKeys.monthlyKpi,
      3,
    );

    expect(loaded.input.tickets).toHaveLength(2);
    expect(loaded.truncatedInput).toBe(false);
  });
});
