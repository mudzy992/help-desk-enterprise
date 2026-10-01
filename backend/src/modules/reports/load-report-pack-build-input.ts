import { PrismaService } from '../../common/prisma/prisma.service';
import { loadTicketCsatSubmissions } from '../tickets/csat/load-ticket-csat-submissions';
import { toArticleRecord } from '../knowledge-base/load-knowledge-article';
import type { KnowledgeArticleRecord } from '../knowledge-base/knowledge-base.types';
import { loadForwardPingPongTickets } from './load-forward-ping-pong-tickets';
import { loadTimeTrackingEntries } from './load-time-tracking-entries';
import { loadScopedReportTickets } from './load-scoped-report-tickets';
import { assetReportHorizonDays } from './packs/build-asset-reports';
import { loadAssetReportData, type AssetReportPart } from './packs/load-asset-report-data';
import { loadProblemReportData, type ProblemReportPart } from './packs/load-problem-report-data';
import { loadChangeReportData } from './packs/load-change-report-data';
import { isAssetReportPack, isChangeReportPack, isProblemReportPack, reportPackKeys, type ReportPackKey } from './reports.constants';
import { settingKeys } from '../settings/setting-keys';

const assetPackParts: Readonly<Record<string, AssetReportPart>> = {
  [reportPackKeys.assetInventory]: 'inventory',
  [reportPackKeys.assetExpiring]: 'expiring',
  [reportPackKeys.assetLicenseCompliance]: 'licenses',
  [reportPackKeys.assetTopTickets]: 'ticketLinks',
  [reportPackKeys.assetInactiveHolders]: 'holders',
};

const problemPackParts: Readonly<Record<string, ProblemReportPart>> = {
  [reportPackKeys.problemTop]: 'top',
  [reportPackKeys.problemTimeToKnownError]: 'knownError',
  [reportPackKeys.problemTimeToResolution]: 'resolution',
  [reportPackKeys.problemBacklog]: 'backlog',
  [reportPackKeys.problemRecurrence]: 'recurrence',
};

async function readReportLocale(prisma: PrismaService): Promise<'bs' | 'en'> {
  const row = await prisma.appSetting.findUnique({ where: { key: settingKeys.privateI18nDefaultLocale }, select: { value: true } });
  return typeof row?.value === 'string' && row.value.toLowerCase().startsWith('en') ? 'en' : 'bs';
}
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
  if (isProblemReportPack(pack)) {
    const problems = await loadProblemReportData(prisma, { unitIds: organizationalUnitIds, part: problemPackParts[pack], window, now: new Date() });
    return { window, tickets: [], csatByTicketId: new Map(), closeCodesById: new Map(), articles: [], feedback: [], problems };
  }
  if (isChangeReportPack(pack)) {
    const part = pack === reportPackKeys.changeOutcomes ? 'outcomes' : 'schedule';
    const changes = await loadChangeReportData(prisma, { unitIds: organizationalUnitIds, part, window });
    return { window, tickets: [], csatByTicketId: new Map(), closeCodesById: new Map(), articles: [], feedback: [], changes };
  }
  if (isAssetReportPack(pack)) {
    const assets = await loadAssetReportData(prisma, {
      unitIds: organizationalUnitIds,
      parts: new Set([assetPackParts[pack]]),
      window,
      now: new Date(),
      locale: await readReportLocale(prisma),
      horizonDays: assetReportHorizonDays,
    });
    return {
      window,
      tickets: [],
      csatByTicketId: new Map(),
      closeCodesById: new Map(),
      articles: [],
      feedback: [],
      assets,
    };
  }
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
    select: { articleId: true, isHelpful: true, rating: true, createdAt: true },
  });
  return votes.map((vote) => ({
    articleId: vote.articleId,
    isHelpful: vote.isHelpful,
    rating: vote.rating ?? null,
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
