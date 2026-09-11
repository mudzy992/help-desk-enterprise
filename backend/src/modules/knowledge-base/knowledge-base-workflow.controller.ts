import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import {
  authorizationRoleKeys,
} from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { KnowledgeFeedbackDto } from './dto/knowledge-feedback.dto';
import { KnowledgeLifecycleDto } from './dto/knowledge-lifecycle.dto';
import { KnowledgeBaseDiscoveryService } from './knowledge-base-discovery.service';
import { KnowledgeBaseWorkflowService } from './knowledge-base-workflow.service';
import type { KnowledgeArticleResponse } from './knowledge-base.types';
import type { KnowledgeFeedbackResponse } from './submit-knowledge-feedback';
import { readKnowledgeMutationContext } from './read-knowledge-mutation-context';

@Controller('knowledge-base/articles')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(
  authorizationRoleKeys.user,
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class KnowledgeBaseWorkflowController {
  constructor(
    private readonly workflowService: KnowledgeBaseWorkflowService,
    private readonly discoveryService: KnowledgeBaseDiscoveryService,
  ) {}

  @Post(':articleId/submit-review')
  submitReview(
    @Param('articleId') articleId: string,
    @Body() body: KnowledgeLifecycleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<KnowledgeArticleResponse> {
    return this.workflowService.submitReview(
      articleId,
      body,
      readKnowledgeMutationContext(request),
    );
  }

  @Post(':articleId/approve-review')
  approveReview(
    @Param('articleId') articleId: string,
    @Body() body: KnowledgeLifecycleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<KnowledgeArticleResponse> {
    return this.workflowService.approveReview(
      articleId,
      body,
      readKnowledgeMutationContext(request),
    );
  }

  @Post(':articleId/reject-review')
  rejectReview(
    @Param('articleId') articleId: string,
    @Body() body: KnowledgeLifecycleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<KnowledgeArticleResponse> {
    return this.workflowService.rejectReview(
      articleId,
      body,
      readKnowledgeMutationContext(request),
    );
  }

  @Post(':articleId/publish')
  publish(
    @Param('articleId') articleId: string,
    @Body() body: KnowledgeLifecycleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<KnowledgeArticleResponse> {
    return this.workflowService.publish(
      articleId,
      body,
      readKnowledgeMutationContext(request),
    );
  }

  @Post(':articleId/archive')
  archive(
    @Param('articleId') articleId: string,
    @Body() body: KnowledgeLifecycleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<KnowledgeArticleResponse> {
    return this.workflowService.archive(
      articleId,
      body,
      readKnowledgeMutationContext(request),
    );
  }

  @Post(':articleId/feedback')
  submitFeedback(
    @Param('articleId') articleId: string,
    @Body() body: KnowledgeFeedbackDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<KnowledgeFeedbackResponse> {
    return this.discoveryService.submitFeedback(
      articleId,
      body,
      readKnowledgeMutationContext(request),
    );
  }
}
