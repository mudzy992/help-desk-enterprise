import { Injectable, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { auditLogActions, auditLogEntityTypes } from '../../audit-log/audit-log.constants';
import type { AuditLogTransactionalClient } from '../../audit-log/audit-log.types';
import { recordAuditEntry } from '../../audit-log/record-audit-entry';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { permissionKeys } from '../../authorization/authorization.constants';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { settingKeys } from '../../settings/setting-keys';
import { SettingsService } from '../../settings/settings.service';
import { ticketSystemEventActions } from '../../tickets/collaboration.constants';
import { insertSystemTicketEvent } from '../../tickets/insert-system-ticket-event';
import { loadAccessibleTicket } from '../../tickets/load-accessible-ticket';
import { TicketsError } from '../../tickets/tickets.error';
import { assertCanWriteKnowledgeArticle } from '../assert-knowledge-article-mutation';
import { canUseKnowledgePermission } from '../authorize-knowledge-article';
import { createKnowledgeArticle } from '../create-knowledge-article';
import { executeKnowledgeBaseOperation } from '../execute-knowledge-base-operation';
import { KnowledgeBaseConfigurationLoader } from '../knowledge-base-configuration.loader';
import { KnowledgeBaseError } from '../knowledge-base.error';
import type {
  CreateKnowledgeArticleInput,
  KnowledgeArticleMutationContext,
  KnowledgeArticleRecord,
  KnowledgeArticleResponse,
} from '../knowledge-base.types';
import { listKnowledgeArticles } from '../list-knowledge-articles';
import { loadKnowledgeActorContext } from '../load-knowledge-actor-context';
import { loadKnowledgeArticleRecord, toArticleRecord } from '../load-knowledge-article';
import {
  isKnowledgeArticleVisibleTo,
  loadKnowledgeArticleScope,
  loadOwnerGroupMemberUserIds,
} from '../load-knowledge-article-scope';
import { changeLogActions, recordKnowledgeArticleChange } from '../record-knowledge-article-change';
import { toKnowledgeArticleResponse } from '../to-knowledge-article-response';
import { withKnowledgeArticleFreshness } from '../with-knowledge-article-freshness';
import { recordKnowledgeArticleView } from './knowledge-article-views';
import {
  assertKnowledgeCategoryAssignable,
  createKnowledgeCategory,
  listKnowledgeCategories,
  setKnowledgeCategoryArchived,
  updateKnowledgeCategory,
  type KnowledgeCategoryRecord,
  type SaveKnowledgeCategoryInput,
} from './knowledge-categories';
import { replyScrubLabels, scrubReplyPersonalData, type ReplyScrubCounts } from './scrub-reply-personal-data';

export type KnowledgePortalArticle = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly categoryId: string | null;
  readonly isFaq: boolean;
  readonly faqOrder: number | null;
  readonly averageRating: number | null;
  readonly ratingCount: number;
  readonly viewCount: number;
  readonly isStale: boolean;
  readonly publishedAt: string | null;
};

export type KnowledgePortalCategory = KnowledgeCategoryRecord & {
  /** Published articles the viewer can read (own + subcategories for a root). */
  readonly articleCount: number;
};

export type KnowledgePortalCapabilities = {
  readonly canManageCategories: boolean;
  /** Any knowledge write/review/publish right: may place articles, sees insights. */
  readonly canCurate: boolean;
  readonly canDraftFromReply: boolean;
};

export type KnowledgePortalHome = {
  readonly categories: readonly KnowledgePortalCategory[];
  readonly faq: readonly (KnowledgePortalArticle & { readonly body: string })[];
  readonly uncategorizedCount: number;
  readonly capabilities: KnowledgePortalCapabilities;
  readonly feedbackEnabled: boolean;
};

export type KnowledgePlacementInput = {
  readonly categoryId?: string | null;
  readonly isFaq?: boolean;
  readonly faqOrder?: number | null;
  readonly reason: string;
};

export type KnowledgeInsights = {
  readonly mostViewed: readonly (KnowledgePortalArticle & { readonly views30d: number })[];
  readonly lowestRated: readonly KnowledgePortalArticle[];
  readonly notViewed: readonly KnowledgePortalArticle[];
  readonly openComments: readonly {
    readonly id: string;
    readonly articleId: string;
    readonly articleTitle: string;
    readonly rating: number;
    readonly comment: string;
    readonly createdAt: string;
  }[];
  readonly thresholds: { readonly minRatings: number; readonly notViewedDays: number };
};

export type KnowledgeDraftFromReply = {
  readonly title: string;
  readonly body: string;
  readonly serviceId: string;
  readonly organizationalUnitId: string;
  readonly sourceTicketId: string;
  readonly sourceMessageId: string;
  readonly ticketNumber: string;
  readonly replacements: ReplyScrubCounts;
};

export type CreateArticleFromReplyInput = Omit<
  CreateKnowledgeArticleInput,
  'sourceTicketId' | 'sourceMessageId'
> & {
  readonly ticketId: string;
  readonly messageId: string;
};

/** Insight thresholds (design §2.4): fixed, documented; not worth a setting. */
export const knowledgeInsightThresholds = { minRatings: 5, notViewedDays: 90, listSize: 10 } as const;

const previewLength = 220;

/**
 * Paket 2.9 (K1): knowledge portal — categories, FAQ, placement, views,
 * insights and "article from a reply". Every route is open to signed-in users;
 * the checks are here (RoleGuard needs a permission per route).
 */
@Injectable()
export class KnowledgePortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loader: AuthorizationContextLoader,
    private readonly configurationLoader: KnowledgeBaseConfigurationLoader,
    private readonly settings: SettingsService,
    @Optional() private readonly redisService?: RedisService,
  ) {}

  // ------------------------------------------------------------------ read

  home(context: KnowledgeArticleMutationContext): Promise<KnowledgePortalHome> {
    return executeKnowledgeBaseOperation(async () => {
      const actor = await loadKnowledgeActorContext(this.loader, context);
      const configuration = await this.configurationLoader.load();
      const [articles, categories, faqMaxItems] = await Promise.all([
        this.visiblePublished(context),
        listKnowledgeCategories(this.prisma, { includeArchived: false }),
        this.faqMaxItems(),
      ]);
      const activeIds = new Set(categories.map((category) => category.id));
      const direct = new Map<string, number>();
      let uncategorizedCount = 0;
      for (const article of articles) {
        if (article.categoryId !== null && activeIds.has(article.categoryId)) {
          direct.set(article.categoryId, (direct.get(article.categoryId) ?? 0) + 1);
        } else {
          uncategorizedCount += 1;
        }
      }
      const withCounts = categories.map((category) => ({
        ...category,
        articleCount:
          (direct.get(category.id) ?? 0) +
          (category.parentId === null
            ? categories
                .filter((child) => child.parentId === category.id)
                .reduce((sum, child) => sum + (direct.get(child.id) ?? 0), 0)
            : 0),
      }));
      const faq = articles
        .filter((article) => article.isFaq)
        .sort(compareFaq)
        .slice(0, faqMaxItems)
        .map((article) => ({ ...toPortalArticle(article), body: article.body }));
      return {
        categories: withCounts,
        faq,
        uncategorizedCount,
        capabilities: this.capabilitiesOf(actor),
        feedbackEnabled: configuration.feedbackEnabled,
      };
    });
  }

  /** `categoryId` = a category id or `uncategorized`. A root includes its children. */
  categoryArticles(
    categoryId: string,
    context: KnowledgeArticleMutationContext,
  ): Promise<readonly KnowledgePortalArticle[]> {
    return executeKnowledgeBaseOperation(async () => {
      const categories = await listKnowledgeCategories(this.prisma, { includeArchived: false });
      const articles = await this.visiblePublished(context);
      const activeIds = new Set(categories.map((category) => category.id));
      let matches: (article: KnowledgeArticleRecord) => boolean;
      if (categoryId === 'uncategorized') {
        matches = (article) => article.categoryId === null || !activeIds.has(article.categoryId);
      } else {
        const category = categories.find((item) => item.id === categoryId);
        if (category === undefined) {
          throw new KnowledgeBaseError('CATEGORY_NOT_FOUND');
        }
        const ids = new Set([
          category.id,
          ...categories.filter((child) => child.parentId === category.id).map((child) => child.id),
        ]);
        matches = (article) => article.categoryId !== null && ids.has(article.categoryId);
      }
      return articles
        .filter(matches)
        .sort((left, right) => left.title.localeCompare(right.title, 'bs'))
        .map(toPortalArticle);
    });
  }

  categories(
    context: KnowledgeArticleMutationContext,
    includeArchived: boolean,
  ): Promise<readonly KnowledgeCategoryRecord[]> {
    return executeKnowledgeBaseOperation(async () => {
      const actor = await loadKnowledgeActorContext(this.loader, context);
      const canManage = hasPermission(actor, permissionKeys.knowledgeCategoryManage);
      return listKnowledgeCategories(this.prisma, { includeArchived: includeArchived && canManage });
    });
  }

  // ------------------------------------------------------- category admin

  createCategory(
    input: SaveKnowledgeCategoryInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeCategoryRecord> {
    return executeKnowledgeBaseOperation(async () => {
      await this.assertCategoryManager(context);
      const created = await createKnowledgeCategory(this.prisma, input);
      await this.audit(auditLogActions.knowledgeCategoryCreated, auditLogEntityTypes.knowledgeCategory, created.id, context, {
        key: created.key,
        nameBs: created.nameBs,
        parentId: created.parentId,
      });
      return created;
    });
  }

  updateCategory(
    id: string,
    input: SaveKnowledgeCategoryInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeCategoryRecord> {
    return executeKnowledgeBaseOperation(async () => {
      await this.assertCategoryManager(context);
      const { before, after } = await updateKnowledgeCategory(this.prisma, id, input);
      await this.audit(auditLogActions.knowledgeCategoryUpdated, auditLogEntityTypes.knowledgeCategory, id, context, {
        before: { ...before },
        after: { ...after },
      });
      return after;
    });
  }

  setCategoryArchived(
    id: string,
    archived: boolean,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeCategoryRecord> {
    return executeKnowledgeBaseOperation(async () => {
      await this.assertCategoryManager(context);
      const { after } = await setKnowledgeCategoryArchived(this.prisma, id, archived);
      await this.audit(
        archived ? auditLogActions.knowledgeCategoryArchived : auditLogActions.knowledgeCategoryRestored,
        auditLogEntityTypes.knowledgeCategory,
        id,
        context,
        { key: after.key },
      );
      return after;
    });
  }

  // ------------------------------------------------------------- placement

  /** Category / FAQ of an article: its writer, or a reviewer/publisher in scope. */
  placeArticle(
    articleId: string,
    input: KnowledgePlacementInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticleResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const actor = await loadKnowledgeActorContext(this.loader, context);
      const current = await loadKnowledgeArticleRecord(this.prisma, articleId);
      const scope = await loadKnowledgeArticleScope(this.prisma, current);
      const ownerGroupMemberUserIds = await loadOwnerGroupMemberUserIds(this.prisma, current.ownerGroupId);
      const curator =
        [permissionKeys.knowledgeArticleReview, permissionKeys.knowledgeArticlePublish].some((permissionKey) =>
          canUseKnowledgePermission({ context: actor, permissionKey, ...scope }),
        ) && current.status !== 'ARCHIVED';
      if (!curator) {
        assertCanWriteKnowledgeArticle({ context: actor, article: current, scope, ownerGroupMemberUserIds });
      }
      const categoryId =
        input.categoryId === undefined
          ? current.categoryId
          : await assertKnowledgeCategoryAssignable(this.prisma, input.categoryId);
      const isFaq = input.isFaq ?? current.isFaq;
      const faqOrder = !isFaq ? null : input.faqOrder === undefined ? current.faqOrder : input.faqOrder;
      if (faqOrder !== null && (!Number.isInteger(faqOrder) || faqOrder < 0 || faqOrder > 999)) {
        throw new KnowledgeBaseError('INVALID_CATEGORY');
      }
      const updated = toArticleRecord(
        await this.prisma.knowledgeArticle.update({
          where: { id: articleId },
          data: { categoryId, isFaq, faqOrder },
        }),
      );
      await recordKnowledgeArticleChange(this.prisma, {
        action: changeLogActions.update,
        reason: input.reason,
        before: current,
        after: updated,
        actorUserId: context.actorUserId,
      });
      return toKnowledgeArticleResponse(updated);
    });
  }

  // ------------------------------------------------------------------ views

  recordView(articleId: string, context: KnowledgeArticleMutationContext): Promise<void> {
    return executeKnowledgeBaseOperation(async () => {
      const actor = await loadKnowledgeActorContext(this.loader, context);
      const article = await loadKnowledgeArticleRecord(this.prisma, articleId);
      if (!(await isKnowledgeArticleVisibleTo(this.prisma, actor, article))) {
        throw new KnowledgeBaseError('FORBIDDEN');
      }
      // Drafts and reviews are work in progress: only published views count.
      if (article.status !== 'PUBLISHED') {
        return;
      }
      await recordKnowledgeArticleView({
        prisma: this.prisma,
        redis: this.redis(),
        articleId,
        userId: context.actorUserId,
        now: new Date(),
      });
    });
  }

  // --------------------------------------------------------------- insights

  insights(context: KnowledgeArticleMutationContext): Promise<KnowledgeInsights> {
    return executeKnowledgeBaseOperation(async () => {
      const actor = await loadKnowledgeActorContext(this.loader, context);
      if (!this.capabilitiesOf(actor).canCurate) {
        throw new KnowledgeBaseError('FORBIDDEN');
      }
      const now = Date.now();
      const articles = await this.visiblePublished(context);
      const ids = articles.map((article) => article.id);
      const since = new Date(now - 30 * 86_400_000);
      since.setUTCHours(0, 0, 0, 0);
      const recent =
        ids.length === 0
          ? []
          : await this.prisma.knowledgeArticleView.groupBy({
              by: ['articleId'],
              where: { articleId: { in: ids }, day: { gte: since } },
              _sum: { views: true },
            });
      const views30d = new Map(recent.map((row) => [row.articleId, row._sum.views ?? 0]));
      const { minRatings, notViewedDays, listSize } = knowledgeInsightThresholds;
      const staleBefore = now - notViewedDays * 86_400_000;
      const lastViewed = new Map(
        (ids.length === 0
          ? []
          : await this.prisma.knowledgeArticle.findMany({
              where: { id: { in: ids } },
              select: { id: true, lastViewedAt: true },
            })
        ).map((row) => [row.id, row.lastViewedAt]),
      );
      const writable = new Set<string>();
      for (const article of articles) {
        if (await this.canWrite(actor, article)) writable.add(article.id);
      }
      const comments =
        writable.size === 0
          ? []
          : await this.prisma.knowledgeFeedback.findMany({
              where: {
                articleId: { in: [...writable] },
                comment: { not: null },
                commentResolvedAt: null,
              },
              select: { id: true, articleId: true, rating: true, comment: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 50,
            });
      const titles = new Map(articles.map((article) => [article.id, article.title]));
      return {
        mostViewed: articles
          .filter((article) => (views30d.get(article.id) ?? 0) > 0)
          .sort((left, right) => (views30d.get(right.id) ?? 0) - (views30d.get(left.id) ?? 0))
          .slice(0, listSize)
          .map((article) => ({ ...toPortalArticle(article), views30d: views30d.get(article.id) ?? 0 })),
        lowestRated: articles
          .filter((article) => article.ratingCount >= minRatings)
          .sort((left, right) => left.ratingSum / left.ratingCount - right.ratingSum / right.ratingCount)
          .slice(0, listSize)
          .map(toPortalArticle),
        notViewed: articles
          .filter((article) => {
            const published = article.publishedAt?.getTime() ?? 0;
            const viewed = lastViewed.get(article.id)?.getTime() ?? 0;
            return published < staleBefore && viewed < staleBefore;
          })
          .sort((left, right) => (lastViewed.get(left.id)?.getTime() ?? 0) - (lastViewed.get(right.id)?.getTime() ?? 0))
          .slice(0, listSize)
          .map(toPortalArticle),
        openComments: comments.map((row) => ({
          id: row.id,
          articleId: row.articleId,
          articleTitle: titles.get(row.articleId) ?? '',
          rating: row.rating ?? 0,
          comment: row.comment ?? '',
          createdAt: row.createdAt.toISOString(),
        })),
        thresholds: { minRatings, notViewedDays },
      };
    });
  }

  /** The article's writer marks a "what is missing" comment as handled. */
  resolveComment(feedbackId: string, context: KnowledgeArticleMutationContext): Promise<void> {
    return executeKnowledgeBaseOperation(async () => {
      const actor = await loadKnowledgeActorContext(this.loader, context);
      const feedback = await this.prisma.knowledgeFeedback.findUnique({
        where: { id: feedbackId },
        select: { id: true, articleId: true },
      });
      if (feedback === null) {
        throw new KnowledgeBaseError('NOT_FOUND');
      }
      const article = await loadKnowledgeArticleRecord(this.prisma, feedback.articleId);
      if (!(await this.canWrite(actor, article))) {
        throw new KnowledgeBaseError('FORBIDDEN');
      }
      await this.prisma.knowledgeFeedback.update({
        where: { id: feedbackId },
        data: { commentResolvedAt: new Date() },
      });
    });
  }

  // ---------------------------------------------------- article from reply

  draftFromReply(
    ticketId: string,
    messageId: string,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeDraftFromReply> {
    return executeKnowledgeBaseOperation(async () => {
      const source = await this.loadReplySource(ticketId, messageId, context);
      const labels = replyScrubLabels[source.locale];
      const body = scrubReplyPersonalData(source.body, source.people, labels);
      const title = scrubReplyPersonalData(source.title, source.people, labels);
      const sum = (key: keyof ReplyScrubCounts) => body.counts[key] + title.counts[key];
      return {
        title: title.text.slice(0, 200),
        body: body.text,
        serviceId: source.serviceId,
        organizationalUnitId: source.organizationalUnitId,
        sourceTicketId: ticketId,
        sourceMessageId: messageId,
        ticketNumber: source.ticketNumber,
        replacements: { email: sum('email'), person: sum('person'), ip: sum('ip'), phone: sum('phone') },
      };
    });
  }

  createFromReply(
    input: CreateArticleFromReplyInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticleResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const source = await this.loadReplySource(input.ticketId, input.messageId, context);
      const { ticketId, messageId, ...article } = input;
      const created = await createKnowledgeArticle(
        this.prisma,
        this.loader,
        { ...article, sourceTicketId: ticketId, sourceMessageId: messageId },
        context,
      );
      // Internal trace on the ticket (SYSTEM_EVENT is staff only).
      await insertSystemTicketEvent(this.prisma, {
        ticketId,
        action: ticketSystemEventActions.knowledgeDraftCreated,
        actorUserId: context.actorUserId,
        detail: `${created.id}|${created.title.replace(/\|/g, '/')}`,
      });
      await this.audit(
        auditLogActions.knowledgeArticleDraftedFromReply,
        auditLogEntityTypes.knowledgeArticle,
        created.id,
        context,
        { ticketNumber: source.ticketNumber, messageId },
      );
      return toKnowledgeArticleResponse(created);
    });
  }

  // ---------------------------------------------------------------- helpers

  private async loadReplySource(
    ticketId: string,
    messageId: string,
    context: KnowledgeArticleMutationContext,
  ) {
    let ticket: Awaited<ReturnType<typeof loadAccessibleTicket>>['ticket'];
    let visibility: string;
    try {
      const loaded = await loadAccessibleTicket(this.prisma, this.loader, ticketId, context);
      ticket = loaded.ticket;
      visibility = loaded.access.visibility;
    } catch (error) {
      if (error instanceof TicketsError && error.code === 'NOT_FOUND') {
        throw new KnowledgeBaseError('SOURCE_TICKET_NOT_FOUND');
      }
      throw new KnowledgeBaseError('FORBIDDEN');
    }
    // Staff only; confidential tickets never feed the knowledge base.
    if (visibility !== 'staff' || ticket.isConfidential) {
      throw new KnowledgeBaseError('FORBIDDEN');
    }
    const message = await this.prisma.ticketMessage.findUnique({
      where: { id: messageId },
      select: { id: true, ticketId: true, type: true, body: true, authorUserId: true },
    });
    if (message === null || message.ticketId !== ticketId) {
      throw new KnowledgeBaseError('SOURCE_MESSAGE_NOT_FOUND');
    }
    if (message.type !== 'AGENT_REPLY') {
      throw new KnowledgeBaseError('SOURCE_MESSAGE_NOT_PUBLIC');
    }
    const participantIds = (
      await this.prisma.ticketParticipant.findMany({ where: { ticketId }, select: { userId: true } })
    ).map((row) => row.userId);
    const personIds = [
      ...new Set(
        [ticket.requesterId, message.authorUserId, ...participantIds].filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        ),
      ),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: personIds } },
      select: { id: true, email: true, displayName: true, distinguishedName: true },
    });
    const actor = await this.prisma.user.findUnique({
      where: { id: context.actorUserId },
      select: { preferredLocale: true },
    });
    return {
      title: ticket.title,
      body: message.body,
      serviceId: ticket.serviceId,
      organizationalUnitId: ticket.originUnitId,
      ticketNumber: ticket.ticketNumber,
      locale: (actor?.preferredLocale?.startsWith('en') ? 'en' : 'bs') as 'bs' | 'en',
      people: users.map((user) => ({
        displayName: user.displayName,
        email: user.email,
        distinguishedName: user.distinguishedName,
        logins: [user.email.split('@')[0]],
      })),
    };
  }

  private async visiblePublished(context: KnowledgeArticleMutationContext): Promise<KnowledgeArticleRecord[]> {
    const configuration = await this.configurationLoader.load();
    const now = new Date();
    const records = await listKnowledgeArticles(this.prisma, this.loader, { status: 'PUBLISHED' }, context);
    return records.map((record) => withKnowledgeArticleFreshness(record, configuration, now));
  }

  private async canWrite(actor: AuthorizationContext, article: KnowledgeArticleRecord): Promise<boolean> {
    try {
      const scope = await loadKnowledgeArticleScope(this.prisma, article);
      const ownerGroupMemberUserIds = await loadOwnerGroupMemberUserIds(this.prisma, article.ownerGroupId);
      assertCanWriteKnowledgeArticle({ context: actor, article, scope, ownerGroupMemberUserIds });
      return true;
    } catch {
      return false;
    }
  }

  private capabilitiesOf(actor: AuthorizationContext): KnowledgePortalCapabilities {
    const canWrite = hasPermission(actor, permissionKeys.knowledgeArticleWrite);
    return {
      canManageCategories: hasPermission(actor, permissionKeys.knowledgeCategoryManage),
      canCurate:
        canWrite ||
        hasPermission(actor, permissionKeys.knowledgeArticleReview) ||
        hasPermission(actor, permissionKeys.knowledgeArticlePublish),
      canDraftFromReply: canWrite,
    };
  }

  private async assertCategoryManager(context: KnowledgeArticleMutationContext): Promise<void> {
    const actor = await loadKnowledgeActorContext(this.loader, context);
    if (!hasPermission(actor, permissionKeys.knowledgeCategoryManage)) {
      throw new KnowledgeBaseError('FORBIDDEN');
    }
  }

  private async faqMaxItems(): Promise<number> {
    const value = await this.settings.getSetting(settingKeys.privateKnowledgeBasePortalFaqMaxItems);
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 20 ? value : 8;
  }

  private redis(): Redis | null {
    try {
      return this.redisService?.getClient() ?? null;
    } catch {
      return null;
    }
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    context: KnowledgeArticleMutationContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await recordAuditEntry(this.prisma as unknown as AuditLogTransactionalClient, {
      action,
      entityType,
      entityId,
      metadata: JSON.parse(JSON.stringify(metadata)),
      actorUserId: context.actorUserId,
    });
  }
}

function hasPermission(context: AuthorizationContext, key: string): boolean {
  return context.isSuperAdmin || context.assignments.some((assignment) => assignment.permissionKeys.includes(key));
}

function compareFaq(left: KnowledgeArticleRecord, right: KnowledgeArticleRecord): number {
  const leftOrder = left.faqOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.faqOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  if (right.viewCount !== left.viewCount) return right.viewCount - left.viewCount;
  return left.title.localeCompare(right.title, 'bs');
}

export function toPortalArticle(article: KnowledgeArticleRecord): KnowledgePortalArticle {
  const plain = article.body.replace(/[#*_`>[\]()!-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    bodyPreview: plain.length > previewLength ? `${plain.slice(0, previewLength).trimEnd()}…` : plain,
    categoryId: article.categoryId,
    isFaq: article.isFaq,
    faqOrder: article.faqOrder,
    averageRating: article.ratingCount > 0 ? Math.round((article.ratingSum / article.ratingCount) * 10) / 10 : null,
    ratingCount: article.ratingCount,
    viewCount: article.viewCount,
    isStale: article.isStale,
    publishedAt: article.publishedAt === null ? null : article.publishedAt.toISOString(),
  };
}
