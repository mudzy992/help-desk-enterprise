import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import { readKnowledgeMutationContext } from '../read-knowledge-mutation-context';
import {
  CreateArticleFromReplyDto,
  KnowledgePlacementDto,
  KnowledgeReplySourceDto,
  SaveKnowledgeCategoryDto,
} from './knowledge-portal.dto';
import { KnowledgePortalService } from './knowledge-portal.service';

/**
 * Paket 2.9 (K1): knowledge portal. Every signed-in user reads; category
 * management, placement, insights and "article from reply" are checked in the
 * service (RoleGuard denies routes without a permission requirement).
 */
@Controller('knowledge-base/portal')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class KnowledgePortalController {
  constructor(private readonly portal: KnowledgePortalService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  home(@Req() request: AuthenticatedHttpRequest) {
    return this.portal.home(readKnowledgeMutationContext(request));
  }

  @Get('categories')
  @Header('Cache-Control', 'no-store')
  categories(@Req() request: AuthenticatedHttpRequest, @Query('includeArchived') includeArchived?: string) {
    return this.portal.categories(readKnowledgeMutationContext(request), includeArchived === 'true');
  }

  @Get('categories/:id/articles')
  @Header('Cache-Control', 'no-store')
  categoryArticles(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return this.portal.categoryArticles(id, readKnowledgeMutationContext(request));
  }

  @Post('categories')
  createCategory(@Req() request: AuthenticatedHttpRequest, @Body() body: SaveKnowledgeCategoryDto) {
    return this.portal.createCategory(body, readKnowledgeMutationContext(request));
  }

  @Patch('categories/:id')
  updateCategory(
    @Req() request: AuthenticatedHttpRequest,
    @Param('id') id: string,
    @Body() body: SaveKnowledgeCategoryDto,
  ) {
    return this.portal.updateCategory(id, body, readKnowledgeMutationContext(request));
  }

  @Post('categories/:id/archive')
  archiveCategory(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return this.portal.setCategoryArchived(id, true, readKnowledgeMutationContext(request));
  }

  @Post('categories/:id/restore')
  restoreCategory(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return this.portal.setCategoryArchived(id, false, readKnowledgeMutationContext(request));
  }

  @Patch('articles/:id/placement')
  placeArticle(
    @Req() request: AuthenticatedHttpRequest,
    @Param('id') id: string,
    @Body() body: KnowledgePlacementDto,
  ) {
    return this.portal.placeArticle(id, body, readKnowledgeMutationContext(request));
  }

  @Post('articles/:id/view')
  @HttpCode(204)
  async recordView(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    await this.portal.recordView(id, readKnowledgeMutationContext(request));
  }

  @Get('insights')
  @Header('Cache-Control', 'no-store')
  insights(@Req() request: AuthenticatedHttpRequest) {
    return this.portal.insights(readKnowledgeMutationContext(request));
  }

  @Post('feedback/:id/resolve')
  @HttpCode(204)
  async resolveComment(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    await this.portal.resolveComment(id, readKnowledgeMutationContext(request));
  }

  @Post('from-reply/preview')
  @HttpCode(200)
  draftFromReply(@Req() request: AuthenticatedHttpRequest, @Body() body: KnowledgeReplySourceDto) {
    return this.portal.draftFromReply(body.ticketId, body.messageId, readKnowledgeMutationContext(request));
  }

  @Post('from-reply')
  createFromReply(@Req() request: AuthenticatedHttpRequest, @Body() body: CreateArticleFromReplyDto) {
    return this.portal.createFromReply(body, readKnowledgeMutationContext(request));
  }
}
