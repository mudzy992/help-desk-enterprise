import { PrismaService } from '../../common/prisma/prisma.service';
import { loadTicketCsatSubmissions } from '../tickets/csat/load-ticket-csat-submissions';
import { loadForwardPingPongTickets } from './load-forward-ping-pong-tickets';
import { loadTimeTrackingEntries } from './load-time-tracking-entries';
import { loadScopedReportTickets } from './load-scoped-report-tickets';
import { assetReportHorizonDays } from './packs/build-asset-reports';
import { loadAssetReportData, type AssetReportPart } from './packs/load-asset-report-data';
import { loadProblemReportData, type ProblemReportPart } from './packs/load-problem-report-data';
import type { ProblemReportData } from './packs/build-problem-reports';
import type { ProblemReportVisibility } from './problem-report-visibility';
import { loadChangeReportData } from './packs/load-change-report-data';
import {
  isAssetReportPack,
  isChangeReportPack,
  isProblemReportPack,
  reportPackKeys,
  reportPackLimits,
  type ReportPackKey,
} from './reports.constants';
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
  ReportArticleRow,
  ReportPackBuildInput,
  ReportPackFilters,
  ReportWindow,
} from './reports.types';

/**
 * Loads only what the requested pack needs (plan §3 D5): the ticket-based packs
 * never read articles, the KB pack never reads tickets, only ping-pong reads
 * the forward events.
 */
export type ReportPackLoadResult = {
  readonly input: ReportPackBuildInput;
  /**
   * W7.53 (BA-reports-01): true when the scoped corpus is larger than the row
   * budget. The probe row is dropped from `input`, so callers must treat the
   * build as partial: export/attachment refuse it, preview labels it.
   */
  readonly truncatedInput: boolean;
};

export async function loadReportPackBuildInput(
  prisma: PrismaService,
  organizationalUnitIds: readonly string[],
  window: ReportWindow,
  pack: ReportPackKey,
  pingPongThreshold: number,
  problemVisibility?: ProblemReportVisibility,
  options: {
    readonly rowLimit?: number;
    /**
     * W7.54 (BA-reports-02): the scheduled report's service/group/priority
     * slice. Callers refuse a slice the pack cannot apply
     * (`reportPackScheduleFilterSupport`); this function only applies it.
     */
    readonly filters?: ReportPackFilters;
  } = {},
): Promise<ReportPackLoadResult> {
  const rowLimit = options.rowLimit;
  const filters = options.filters;
  // One probe row tells us the corpus is larger without reading all of it.
  const fetchLimit = rowLimit === undefined ? undefined : rowLimit + 1;
  const overflowed = (rows: readonly unknown[]): boolean =>
    rowLimit !== undefined && rows.length > rowLimit;
  const cut = <T>(rows: readonly T[]): readonly T[] =>
    rowLimit === undefined ? rows : rows.slice(0, rowLimit);

  if (isProblemReportPack(pack)) {
    if (problemVisibility === undefined) throw new Error('PROBLEM_REPORT_VISIBILITY_REQUIRED');
    const problems = await loadProblemReportData(prisma, { unitIds: organizationalUnitIds, part: problemPackParts[pack], window, now: new Date(), visibility: problemVisibility, rowLimit, filters });
    const truncatedInput = problemReportRowCount(problems) > (rowLimit ?? Number.POSITIVE_INFINITY);
    return { input: { window, tickets: [], csatByTicketId: new Map(), closeCodesById: new Map(), articles: [], feedback: [], problems }, truncatedInput };
  }
  if (isChangeReportPack(pack)) {
    const part = pack === reportPackKeys.changeOutcomes ? 'outcomes' : 'schedule';
    const changes = await loadChangeReportData(prisma, { unitIds: organizationalUnitIds, part, window, rowLimit });
    const truncatedInput =
      changes.outcomes.length > (rowLimit ?? Number.POSITIVE_INFINITY) ||
      changes.schedule.length > (rowLimit ?? Number.POSITIVE_INFINITY);
    return { input: { window, tickets: [], csatByTicketId: new Map(), closeCodesById: new Map(), articles: [], feedback: [], changes }, truncatedInput };
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
      input: {
        window,
        tickets: [],
        csatByTicketId: new Map(),
        closeCodesById: new Map(),
        articles: [],
        feedback: [],
        assets,
      },
      // The asset loaders carry their own fixed caps; they are bounded already.
      truncatedInput: false,
    };
  }
  const needsTickets =
    pack !== reportPackKeys.kbHelpfulness &&
    pack !== reportPackKeys.forwardPingPong &&
    pack !== reportPackKeys.timeTracking;
  const tickets = needsTickets
    ? await loadScopedReportTickets(prisma, organizationalUnitIds, true, window, {
        take: fetchLimit,
        filters,
      })
    : [];
  const articles =
    pack === reportPackKeys.kbHelpfulness
      ? await loadScopedArticles(prisma, organizationalUnitIds, fetchLimit, filters?.serviceId)
      : [];
  const forwardTickets =
    pack === reportPackKeys.forwardPingPong
      ? await loadForwardPingPongTickets(prisma, {
          organizationalUnitIds,
          window,
          threshold: pingPongThreshold,
          filters,
          take:
            fetchLimit === undefined
              ? undefined
              : Math.min(fetchLimit, reportPackLimits.forwardEventRows),
        })
      : [];
  const timeEntries =
    pack === reportPackKeys.timeTracking
      ? await loadTimeTrackingEntries(prisma, {
          organizationalUnitIds,
          window,
          filters,
          take: fetchLimit,
        })
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
    loadFeedback(
      prisma,
      articles.map((article) => article.id),
      window,
    ),
    pack === reportPackKeys.overdueByService
      ? loadServiceNames(
          prisma,
          tickets.filter((ticket) => ticket.isOverdue).map((ticket) => ticket.serviceId),
        )
      : Promise.resolve(new Map<string, string>()),
  ]);
  return {
    input: {
      window,
      tickets: cut(tickets),
      serviceNamesById,
      forwardTickets: cut(forwardTickets),
      pingPongThreshold,
      timeEntries: cut(timeEntries),
      csatByTicketId,
      closeCodesById,
      articles: cut(articles),
      feedback,
    },
    truncatedInput:
      overflowed(tickets) ||
      overflowed(articles) ||
      overflowed(forwardTickets) ||
      overflowed(timeEntries),
  };
}

/** Rows a problem part produced; the probe row is included on purpose. */
function problemReportRowCount(problems: ProblemReportData): number {
  return (
    problems.top.length +
    problems.knownError.length +
    problems.resolution.length +
    problems.backlog.length +
    problems.recurrence.length
  );
}

async function loadScopedArticles(
  prisma: PrismaService,
  organizationalUnitIds: readonly string[],
  take?: number,
  serviceId?: string,
): Promise<readonly ReportArticleRow[]> {
  if (organizationalUnitIds.length === 0) {
    return [];
  }
  // W7.53 (BA-reports-01): a narrow projection — the report never reads
  // `body` or the ~20 other article columns, so neither is fetched.
  const records = (await prisma.knowledgeArticle.findMany({
    where: {
      organizationalUnitId: { in: [...organizationalUnitIds] },
      // W7.54 (BA-reports-02): a service-scoped schedule sees only that service.
      ...(serviceId === undefined ? {} : { serviceId }),
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      serviceId: true,
      organizationalUnitId: true,
      viewCount: true,
    },
    take,
  })) as Array<{
    readonly id: string;
    readonly title: string;
    readonly serviceId: string;
    readonly organizationalUnitId: string;
    readonly viewCount?: number | null;
  }>;
  return records.map((record) => ({
    id: record.id,
    title: record.title,
    serviceId: record.serviceId,
    organizationalUnitId: record.organizationalUnitId,
    viewCount: record.viewCount ?? 0,
  }));
}

async function loadCloseCodes(
  prisma: PrismaService,
  ids: readonly string[],
): Promise<ReadonlyMap<string, CloseCodeLookup>> {
  const uniqueIds = [...new Set(ids.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  // W7.101 (`BA-reports-11`): the pack prints id/key/name; the row's service, active flag and timestamps are not
  // read, so they are not fetched either.
  const records = (await prisma.closeCode.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, key: true, name: true },
  })) as CloseCodeLookup[];
  return new Map(records.map((record) => [record.id, record]));
}

async function loadFeedback(
  prisma: PrismaService,
  articleIds: readonly string[],
  window: ReportWindow,
): Promise<readonly KnowledgeFeedbackVote[]> {
  if (articleIds.length === 0) {
    return [];
  }
  // W7.53 (BA-reports-01): votes are never read unscoped — the query is pinned
  // to the (already capped) articles and to the report window, so a lifetime
  // vote history cannot enter the pack.
  const votes = await prisma.knowledgeFeedback.findMany({
    where: {
      articleId: { in: [...articleIds] },
      createdAt: { gte: window.from, lt: window.to },
    },
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
