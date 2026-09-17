import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { executeKnowledgeBaseOperation } from './execute-knowledge-base-operation';
import { interceptKnowledgeArticles } from './intercept-knowledge-articles';
import { KnowledgeBaseConfigurationLoader } from './knowledge-base-configuration.loader';
import type {
  KnowledgeArticleMutationContext,
  KnowledgeFeedbackInput,
  KnowledgeInterceptInput,
  KnowledgeInterceptResponse,
} from './knowledge-base.types';
import {
  resolveKnowledgeIntercept,
  type KnowledgeInterceptResolveInput,
  type KnowledgeInterceptResolveResponse,
} from './resolve-knowledge-intercept';
import {
  submitKnowledgeFeedback,
  type KnowledgeFeedbackResponse,
} from './submit-knowledge-feedback';

@Injectable()
export class KnowledgeBaseDiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: KnowledgeBaseConfigurationLoader,
  ) {}

  intercept(
    input: KnowledgeInterceptInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeInterceptResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      return interceptKnowledgeArticles(
        this.prisma,
        this.authorizationContextLoader,
        configuration,
        input,
        context,
        new Date(),
      );
    });
  }

  resolveIntercept(
    input: KnowledgeInterceptResolveInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeInterceptResolveResponse> {
    return executeKnowledgeBaseOperation(async () =>
      resolveKnowledgeIntercept(this.prisma, input, context),
    );
  }

  submitFeedback(
    articleId: string,
    input: KnowledgeFeedbackInput,
    context: KnowledgeArticleMutationContext,
  ): Promise<KnowledgeFeedbackResponse> {
    return executeKnowledgeBaseOperation(async () => {
      const configuration = await this.configurationLoader.load();
      return submitKnowledgeFeedback(
        this.prisma,
        this.authorizationContextLoader,
        configuration,
        articleId,
        input,
        context,
      );
    });
  }
}
