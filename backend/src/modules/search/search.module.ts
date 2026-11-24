import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { TicketsModule } from '../tickets/tickets.module';
import { SearchController } from './search.controller';
import {
  SearchRateLimiter,
  searchRateLimitTokens,
} from './search-rate-limit';
import { loadSearchRateLimitConfiguration } from './search-rate-limit.configuration';
import { SearchRateLimitGuard } from './search-rate-limit.guard';
import { SearchTelemetry } from './search-telemetry.service';
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
  providers: [
    SearchService,
    // W7.59 (BA-search-05): the request budget. The configuration is read once at
    // startup (it is a deployment setting), the limiter itself is stateless apart
    // from its counter stores.
    SearchRateLimiter,
    SearchRateLimitGuard,
    // W7.112 (BA-search-11): the telemetry sink. It owns the salt and writes one
    // privacy-safe `key=value` line per answered request; it never throws.
    SearchTelemetry,
    {
      provide: searchRateLimitTokens.configuration,
      useFactory: () => loadSearchRateLimitConfiguration(),
    },
  ],
  exports: [SearchService],
})
export class SearchModule {}
