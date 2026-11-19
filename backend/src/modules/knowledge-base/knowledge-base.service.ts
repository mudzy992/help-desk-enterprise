import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { createKnowledgeArticle } from './create-knowledge-article';
import { deleteKnowledgeArticle } from './delete-knowledge-article';
import { executeKnowledgeBaseOperation } from './execute-knowledge-base-operation';
import { getKnowledgeArticle } from './get-knowledge-article';
import { KnowledgeBaseConfigurationLoader } from './knowledge-base-configuration.loader';
import type {
  CreateKnowledgeArticleInput,
  KnowledgeArticleMutationContext,
  KnowledgeArticleResponse,
  KnowledgeLifecycleInput,
  ListKnowledgeArticlesQuery,
  UpdateKnowledgeArticleInput,
} from './knowledge-base.types';
import { listKnowledgeArticles } from './list-knowledge-articles';
import {
  searchKnowledgeArticleTitles,
  type KnowledgeArticleTitleMatch,
} from './search-knowledge-article-titles';
import { loadViewerKnowledgeVotes } from './load-viewer-knowledge-feedback-votes';
import { loadKnowledgeArticleLabels } from './load-knowledge-article-labels';
import { toKnowledgeArticleResponse } from './to-knowledge-article-response';
import { updateKnowledgeArticle } from './update-knowledge-article';
import { withKnowledgeArticleFreshness } from './with-knowledge-article-freshness';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: KnowledgeBaseConfigurationLoader,
  ) {}

  create(
    input: CreateKnowledgeArticleInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticleResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      return toKnowledgeArticleResponse(
        withKnowledgeArticleFreshness(
          await createKnowledgeArticle(
            this.prisma,
            this.authorizationContextLoader,
            input,
            context,
          ),
          configuration,
          new Date(),
        ),
      );
    });
  }

  list(
    query: ListKnowledgeArticlesQuery,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticlePageResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      const now = new Date();
      // W7.52: freshness is needed inside the scan so that `staleOnly` keeps a
      // page full instead of filtering rows out after the page was cut.
      const page = await listKnowledgeArticles(
        this.prisma,
        this.authorizationContextLoader,
        query,
        context,
        {
          limit: query.limit,
          cursor: query.cursor,
          accept: (record) =>
            query.staleOnly !== true ||
            withKnowledgeArticleFreshness(record, configuration, now).isStale ===
              true,
        },
      );
      const fresh = page.items.map((record) =>
        withKnowledgeArticleFreshness(record, configuration, now),
      );
      const votes = await loadViewerKnowledgeVotes(
        this.prisma,
        context.actorUserId,
        fresh.map((record) => record.id),
      );
      const labels = await loadKnowledgeArticleLabels(this.prisma, fresh);
      return {
        items: fresh.map((record) => ({
          ...toKnowledgeArticleResponse(
            record,
            votes.get(record.id)?.isHelpful ?? null,
          ),
          viewerRating: votes.get(record.id)?.rating ?? null,
          ...labels.get(record.id),
        })),
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
      };
    });
  }

  /**
   * Article hits of `GET /search` (plan §1.2). Same visibility as `list`: the
   * candidates are bounded, then filtered by `isKnowledgeArticleVisibleTo`.
   */
  searchTitles(
    query: {
      readonly q: string;
      readonly limit: number;
      readonly candidateMultiplier: number;
    },
    context: KnowledgeArticleMutationContext,
  ): Promise<readonly KnowledgeArticleTitleMatch[]> {
    return executeKnowledgeBaseOperation(() =>
      searchKnowledgeArticleTitles({
        prisma: this.prisma,
        authorizationContextLoader: this.authorizationContextLoader,
        context,
        query: query.q,
        limit: query.limit,
        candidateMultiplier: query.candidateMultiplier,
      }),
    );
  }

  getById(
    articleId: string,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticleResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      const record = await getKnowledgeArticle(
        this.prisma,
        this.authorizationContextLoader,
        articleId,
        context,
      );
      const fresh = withKnowledgeArticleFreshness(
        record,
        configuration,
        new Date(),
      );
      const votes = await loadViewerKnowledgeVotes(
        this.prisma,
        context.actorUserId,
        [fresh.id],
      );
      const labels = await loadKnowledgeArticleLabels(this.prisma, [fresh]);
      return {
        ...toKnowledgeArticleResponse(
          fresh,
          votes.get(fresh.id)?.isHelpful ?? null,
        ),
        viewerRating: votes.get(fresh.id)?.rating ?? null,
        ...labels.get(fresh.id),
      };
    });
  }

  update(
    articleId: string,
    input: UpdateKnowledgeArticleInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticleResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      return toKnowledgeArticleResponse(
        withKnowledgeArticleFreshness(
          await updateKnowledgeArticle(
            this.prisma,
            this.authorizationContextLoader,
            articleId,
            input,
            context,
          ),
          configuration,
          new Date(),
        ),
      );
    });
  }

  remove(
    articleId: string,
    input: KnowledgeLifecycleInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<void> {
    return executeKnowledgeBaseOperation(async () => {
      await deleteKnowledgeArticle(this.prisma, articleId, input, context);
    });
  }
}
