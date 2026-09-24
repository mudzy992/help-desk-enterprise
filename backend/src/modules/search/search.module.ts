import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { TicketsModule } from '../tickets/tickets.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * Phase 1.2 (plan §1.2). The module owns nothing but the orchestration: the
 * ticket group runs through `TicketsService` (its visibility, archive policy and
 * access gates), the article group through `KnowledgeBaseService` (its
 * visibility check), and the people group through the directory read that the
 * admin route uses.
 */
@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    TicketsModule,
    KnowledgeBaseModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
