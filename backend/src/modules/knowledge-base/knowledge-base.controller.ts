import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequireOrganizationalUnitScope } from '../authorization/require-organizational-unit-scope.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RequireServiceScope } from '../authorization/require-service-scope.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { CreateKnowledgeArticleDto } from './dto/create-knowledge-article.dto';
import { KnowledgeInterceptDto } from './dto/knowledge-intercept.dto';
import { ListKnowledgeArticlesQueryDto } from './dto/list-knowledge-articles-query.dto';
import { UpdateKnowledgeArticleDto } from './dto/update-knowledge-article.dto';
import { KnowledgeBaseDiscoveryService } from './knowledge-base-discovery.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import type {
  KnowledgeArticleResponse,
  KnowledgeInterceptResponse,
} from './knowledge-base.types';
import { readKnowledgeMutationContext } from './read-knowledge-mutation-context';

@Controller('knowledge-base')
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
export class KnowledgeBaseController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly discoveryService: KnowledgeBaseDiscoveryService,
  ) {}

  @Post('articles')
  @RequirePermissions(permissionKeys.knowledgeArticleWrite)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  @RequireServiceScope({ field: 'serviceId' })
  create(
    @Body() body: CreateKnowledgeArticleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<KnowledgeArticleResponse> {
    return this.knowledgeBaseService.create(
      body,
      readKnowledgeMutationContext(request),
    );
  }

  @Get('articles')
  list(
    @Query() query: ListKnowledgeArticlesQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<readonly KnowledgeArticleResponse[]> {
    return this.knowledgeBaseService.list(
      query,
      readKnowledgeMutationContext(request),
    );
  }

  @Post('intercept')
  intercept(
    @Body() body: KnowledgeInterceptDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<KnowledgeInterceptResponse> {
    return this.discoveryService.intercept(
      body,
      readKnowledgeMutationContext(request),
    );
  }

  @Get('articles/:articleId')
  getById(
    @Param('articleId') articleId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<KnowledgeArticleResponse> {
    return this.knowledgeBaseService.getById(
      articleId,
      readKnowledgeMutationContext(request),
    );
  }

  @Patch('articles/:articleId')
  update(
    @Param('articleId') articleId: string,
    @Body() body: UpdateKnowledgeArticleDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<KnowledgeArticleResponse> {
    return this.knowledgeBaseService.update(
      articleId,
      body,
      readKnowledgeMutationContext(request),
    );
  }
}
