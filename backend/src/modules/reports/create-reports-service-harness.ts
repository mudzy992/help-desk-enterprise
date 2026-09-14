import { createInMemoryKnowledgeArticleDelegate } from '../knowledge-base/create-in-memory-knowledge-article-delegate';
import { createInMemoryKnowledgeFeedbackDelegate } from '../knowledge-base/create-in-memory-knowledge-feedback-delegate';
import type { KnowledgeArticleRecord } from '../knowledge-base/knowledge-base.types';
import { createInMemoryTicketsPrisma } from '../tickets/create-in-memory-tickets-prisma';
import { seedTicketsHarnessCatalog } from '../tickets/seed-tickets-harness-catalog';
import { ticketsTestIds } from '../tickets/tickets-test-ids';
import { reportPackKeyList } from './reports.constants';
import { ReportsService } from './reports.service';
import type { ReportsConfiguration } from './reports.types';

export function createReportsServiceHarness() {
  const memory = createInMemoryTicketsPrisma();
  seedTicketsHarnessCatalog(memory);
  memory.seedUnit({
    id: 'ou-it-ops',
    parentId: ticketsTestIds.ouIt,
    ouPath: '/Korisnici/IT/Ops',
  });
  const articles = new Map<string, KnowledgeArticleRecord>();
  const feedbacks = new Map();
  const now = () => new Date('2026-09-14T12:00:00.000Z');
  let next = 1;
  const prisma = {
    ...memory.prisma,
    knowledgeArticle: createInMemoryKnowledgeArticleDelegate(
      articles,
      () => `kb-${next++}`,
      now,
    ),
    knowledgeFeedback: createInMemoryKnowledgeFeedbackDelegate(
      feedbacks,
      () => `fb-${next++}`,
      now,
    ),
  };
  const configuration: ReportsConfiguration = {
    reportsEnabled: true,
    addonEnabled: true,
    enabledPacks: reportPackKeyList,
    allowedFormats: ['csv', 'json'],
    bottlenecksEnabled: true,
    defaultWindowDays: 30,
  };
  const reports = new ReportsService(prisma as never, {
    load: async () => configuration,
  } as never);
  return { reports, memory, articles, feedbacks, configuration, prisma };
}
