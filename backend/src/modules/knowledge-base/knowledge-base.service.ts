import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { createKnowledgeArticle } from './create-knowledge-article';
import { executeKnowledgeBaseOperation } from './execute-knowledge-base-operation';
import { getKnowledgeArticle } from './get-knowledge-article';
import { KnowledgeBaseConfigurationLoader } from './knowledge-base-configuration.loader';
import type {
  CreateKnowledgeArticleInput,
  KnowledgeArticleMutationContext,
  KnowledgeArticleResponse,
  ListKnowledgeArticlesQuery,
  UpdateKnowledgeArticleInput,
} from './knowledge-base.types';
import { listKnowledgeArticles } from './list-knowledge-articles';
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
      return records.map((record) =>
        toKnowledgeArticleResponse(
          withKnowledgeArticleFreshness(record, configuration, now),
        ),
      );
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
      return toKnowledgeArticleResponse(
        withKnowledgeArticleFreshness(record, configuration, new Date()),
      );
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
}
