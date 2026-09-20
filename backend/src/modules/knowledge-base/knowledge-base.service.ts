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
import { loadViewerKnowledgeFeedbackVotes } from './load-viewer-knowledge-feedback-votes';
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
    return executeKnowledgeBaseOperation(async () =>
      toKnowledgeArticleResponse(
        await createKnowledgeArticle(
          this.prisma,
          this.authorizationContextLoader,
          input,
          context,
        ),
      ),
    );
  }

  list(
    query: ListKnowledgeArticlesQuery,
    context: KnowledgeArticleMutationContext,
  ): Promise<readonly KnowledgeArticleResponse[]> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      const now = new Date();
      const records = await listKnowledgeArticles(
        this.prisma,
        this.authorizationContextLoader,
        query,
        context,
      );
      const fresh = records
        .map((record) =>
          withKnowledgeArticleFreshness(record, configuration, now),
        )
        .filter(
          (record) => query.staleOnly !== true || record.isStale === true,
        );
      const votes = await loadViewerKnowledgeFeedbackVotes(
        this.prisma,
        context.actorUserId,
        fresh.map((record) => record.id),
      );
      const labels = await loadKnowledgeArticleLabels(this.prisma, fresh);
      return fresh.map((record) => ({
        ...toKnowledgeArticleResponse(record, votes.get(record.id) ?? null),
        ...labels.get(record.id),
      }));
    });
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
      const votes = await loadViewerKnowledgeFeedbackVotes(
        this.prisma,
        context.actorUserId,
        [fresh.id],
      );
      const labels = await loadKnowledgeArticleLabels(this.prisma, [fresh]);
      return {
        ...toKnowledgeArticleResponse(fresh, votes.get(fresh.id) ?? null),
        ...labels.get(fresh.id),
      };
    });
  }

  update(
    articleId: string,
    input: UpdateKnowledgeArticleInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticleResponse> {
    return executeKnowledgeBaseOperation(async () =>
      toKnowledgeArticleResponse(
        await updateKnowledgeArticle(
          this.prisma,
          this.authorizationContextLoader,
          articleId,
          input,
          context,
        ),
      ),
    );
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
