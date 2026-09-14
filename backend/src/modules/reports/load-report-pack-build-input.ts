import { PrismaService } from '../../common/prisma/prisma.service';
import { loadTicketCsatSubmissions } from '../tickets/csat/load-ticket-csat-submissions';
import { toArticleRecord } from '../knowledge-base/load-knowledge-article';
import type { KnowledgeArticleRecord } from '../knowledge-base/knowledge-base.types';
import { loadScopedReportTickets } from './load-scoped-report-tickets';
import type {
  CloseCodeLookup,
  KnowledgeFeedbackVote,
  ReportPackBuildInput,
  ReportWindow,
} from './reports.types';

export async function loadReportPackBuildInput(
  prisma: PrismaService,
  organizationalUnitIds: readonly string[],
  window: ReportWindow,
): Promise<ReportPackBuildInput> {
  const tickets = await loadScopedReportTickets(
    prisma,
    organizationalUnitIds,
    true,
  );
  const articles = await loadScopedArticles(prisma, organizationalUnitIds);
  const [csatByTicketId, closeCodesById, feedback] = await Promise.all([
    loadTicketCsatSubmissions(
      prisma,
      tickets.map((ticket) => ticket.id),
    ),
    loadCloseCodes(
      prisma,
      tickets.map((ticket) => ticket.closeCodeId ?? ''),
    ),
    loadFeedback(prisma, articles.map((article) => article.id)),
  ]);
  return {
    window,
    tickets,
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
