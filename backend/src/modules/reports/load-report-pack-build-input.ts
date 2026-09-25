import { PrismaService } from '../../common/prisma/prisma.service';
import { loadTicketCsatSubmissions } from '../tickets/csat/load-ticket-csat-submissions';
import { toArticleRecord } from '../knowledge-base/load-knowledge-article';
import type { KnowledgeArticleRecord } from '../knowledge-base/knowledge-base.types';
import { loadForwardPingPongTickets } from './load-forward-ping-pong-tickets';
import { loadTimeTrackingEntries } from './load-time-tracking-entries';
import { loadScopedReportTickets } from './load-scoped-report-tickets';
import { reportPackKeys, type ReportPackKey } from './reports.constants';
import type {
  CloseCodeLookup,
  KnowledgeFeedbackVote,
  ReportPackBuildInput,
  ReportWindow,
} from './reports.types';

/**
 * Loads only what the requested pack needs (plan §3 D5): the ticket-based packs
 * never read articles, the KB pack never reads tickets, only ping-pong reads
 * the forward events.
 */
export async function loadReportPackBuildInput(
  prisma: PrismaService,
  organizationalUnitIds: readonly string[],
  window: ReportWindow,
  pack: ReportPackKey,
  pingPongThreshold: number,
): Promise<ReportPackBuildInput> {
  const needsTickets =
    pack !== reportPackKeys.kbHelpfulness &&
    pack !== reportPackKeys.forwardPingPong &&
    pack !== reportPackKeys.timeTracking;
  const tickets = needsTickets
    ? await loadScopedReportTickets(prisma, organizationalUnitIds, true, window)
    : [];
  const articles =
    pack === reportPackKeys.kbHelpfulness
      ? await loadScopedArticles(prisma, organizationalUnitIds)
      : [];
  const forwardTickets =
    pack === reportPackKeys.forwardPingPong
      ? await loadForwardPingPongTickets(prisma, {
          organizationalUnitIds,
          window,
          threshold: pingPongThreshold,
        })
      : [];
  const timeEntries =
    pack === reportPackKeys.timeTracking
      ? await loadTimeTrackingEntries(prisma, { organizationalUnitIds, window })
      : [];
  const [csatByTicketId, closeCodesById, feedback, serviceNamesById] = await Promise.all([
    pack === reportPackKeys.monthlyKpi
      ? loadTicketCsatSubmissions(
          prisma,
          tickets.map((ticket) => ticket.id),
        )
      : Promise.resolve(new Map()),
    pack === reportPackKeys.topCloseCodes
      ? loadCloseCodes(
          prisma,
          tickets.map((ticket) => ticket.closeCodeId ?? ''),
        )
      : Promise.resolve(new Map<string, CloseCodeLookup>()),
    loadFeedback(prisma, articles.map((article) => article.id)),
    pack === reportPackKeys.overdueByService
      ? loadServiceNames(
          prisma,
          tickets.filter((ticket) => ticket.isOverdue).map((ticket) => ticket.serviceId),
        )
      : Promise.resolve(new Map<string, string>()),
  ]);
  return {
    window,
    tickets,
    serviceNamesById,
    forwardTickets,
    pingPongThreshold,
    timeEntries,
    csatByTicketId,
    closeCodesById,
    articles,
    feedback,
  };
}

async function loadScopedArticles(
  prisma: PrismaService,
  organizationalUnitIds: readonly string[],
): Promise<readonly KnowledgeArticleRecord[]> {
  if (organizationalUnitIds.length === 0) {
    return [];
  }
  const records = await prisma.knowledgeArticle.findMany({
    where: { organizationalUnitId: { in: [...organizationalUnitIds] } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
  return records.map((record) => toArticleRecord(record));
}

async function loadCloseCodes(
  prisma: PrismaService,
  ids: readonly string[],
): Promise<ReadonlyMap<string, CloseCodeLookup>> {
  const uniqueIds = [...new Set(ids.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const records = (await prisma.closeCode.findMany({
    where: { id: { in: uniqueIds } },
  })) as CloseCodeLookup[];
  return new Map(records.map((record) => [record.id, record]));
}

async function loadFeedback(
  prisma: PrismaService,
  articleIds: readonly string[],
): Promise<readonly KnowledgeFeedbackVote[]> {
  if (articleIds.length === 0) {
    return [];
  }
  const votes = await prisma.knowledgeFeedback.findMany({
    where: { articleId: { in: [...articleIds] } },
    select: { articleId: true, isHelpful: true, createdAt: true },
  });
  return votes.map((vote) => ({
    articleId: vote.articleId,
    isHelpful: vote.isHelpful,
    createdAt: vote.createdAt,
  }));
}

async function loadServiceNames(
  prisma: PrismaService,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const services = await prisma.service.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true },
  });
  return new Map(services.map((service) => [service.id, service.name]));
}
