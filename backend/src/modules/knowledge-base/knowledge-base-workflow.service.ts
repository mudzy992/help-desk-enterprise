import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { executeKnowledgeBaseOperation } from './execute-knowledge-base-operation';
import { KnowledgeBaseConfigurationLoader } from './knowledge-base-configuration.loader';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeArticleResponse,
  KnowledgeLifecycleInput,
} from './knowledge-base.types';
import {
  archiveKnowledgeArticle,
  publishKnowledgeArticle,
} from './publish-knowledge-article';
import {
  approveKnowledgeArticleReview,
  rejectKnowledgeArticleReview,
} from './review-knowledge-article';
import { submitKnowledgeArticleReview } from './submit-knowledge-article-review';
import { toKnowledgeArticleResponse } from './to-knowledge-article-response';
import { withKnowledgeArticleFreshness } from './with-knowledge-article-freshness';

@Injectable()
export class KnowledgeBaseWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: KnowledgeBaseConfigurationLoader,
  ) {}

  submitReview(
    articleId: string,
    input: KnowledgeLifecycleInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticleResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      return toKnowledgeArticleResponse(
        withKnowledgeArticleFreshness(
          await submitKnowledgeArticleReview(
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

  approveReview(
    articleId: string,
    input: KnowledgeLifecycleInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticleResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      return toKnowledgeArticleResponse(
        withKnowledgeArticleFreshness(
          await approveKnowledgeArticleReview(
            this.prisma,
            this.authorizationContextLoader,
            configuration,
            articleId,
            input,
            context,
            new Date(),
          ),
          configuration,
          new Date(),
        ),
      );
    });
  }

  rejectReview(
    articleId: string,
    input: KnowledgeLifecycleInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticleResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      return toKnowledgeArticleResponse(
        withKnowledgeArticleFreshness(
          await rejectKnowledgeArticleReview(
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

  publish(
    articleId: string,
    input: KnowledgeLifecycleInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticleResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      return toKnowledgeArticleResponse(
        withKnowledgeArticleFreshness(
          await publishKnowledgeArticle(
            this.prisma,
            this.authorizationContextLoader,
            configuration,
            articleId,
            input,
            context,
            new Date(),
          ),
          configuration,
          new Date(),
        ),
      );
    });
  }

  archive(
    articleId: string,
    input: KnowledgeLifecycleInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeArticleResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      return toKnowledgeArticleResponse(
        withKnowledgeArticleFreshness(
          await archiveKnowledgeArticle(
            this.prisma,
            this.authorizationContextLoader,
            articleId,
            input,
            context,
            new Date(),
          ),
          configuration,
          new Date(),
        ),
      );
    });
  }
}
