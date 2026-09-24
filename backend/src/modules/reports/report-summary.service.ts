import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { createSingleFlightCache } from '../../common/cache/single-flight-cache';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { readInstallationTimeZone } from '../settings/read-installation-time-zone';
import type { SettingsService } from '../settings/settings.service';
import { defaultTicketArchiveConfiguration } from '../tickets/archive/archive.constants';
import {
  buildTicketListWhere,
  withTicketWhereClause,
} from '../tickets/list/build-ticket-list-where';
import { TicketsError } from '../tickets/tickets.error';
import { ReportSummaryCache } from './report-summary.cache';
import { loadDashboardSummaryCounts } from './summary/load-dashboard-summary-counts';
import { loadSlaSummaryCounts } from './summary/load-sla-summary-counts';
import { ticketSummaryScopeClause } from './summary/ticket-summary-scope-clause';
import type {
  DashboardSummaryResponse,
  DashboardSummaryScope,
  SlaSummaryResponse,
} from './summary/report-summary.types';

/**
 * Phase 2.4 (plan §2.4): the dashboard and SLA counters as server-side
 * aggregates.
 *
 * Both endpoints reuse the ticket list's scope (`buildTicketListWhere`) — the
 * same RBAC and visibility clauses, not a copy of them — and cache the answer
 * for fifteen seconds per user (and scope). The dashboard's "opened today"
 * boundary comes from the installation's reporting zone
 * (`settingKeys.privateReportsTimeZone`), never from the process `TZ`. The full visibility rules stay in
 * one place: the counters are a different projection of the same query, never a
 * re-implementation of it.
 */
@Injectable()
export class ReportSummaryService {
  /**
   * Staging k6 (2026-09-24): on a cold Redis entry every concurrent request of
   * the same user started its own aggregate scan. Misses are single-flighted
   * per key inside the process; the TTL stays with Redis (ttl 0 here).
   */
  private readonly dashboardFlights = createSingleFlightCache<DashboardSummaryResponse>({
    ttlMs: 0,
  });
  private readonly slaFlights = createSingleFlightCache<SlaSummaryResponse>({
    ttlMs: 0,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly cache: ReportSummaryCache,
    /**
     * Optional so a direct `new ReportSummaryService(...)` in a test keeps
     * working; without it the zone falls back to the installation default
     * (`readInstallationTimeZone`). `ReportsModule` imports `SettingsModule`,
     * so the running application always has it.
     */
    @Optional() private readonly settingsService?: SettingsService,
  ) {}

  async loadDashboardSummary(input: {
    readonly actorUserId: string;
    readonly scope: DashboardSummaryScope;
    /** Injected by the tests; the endpoints always use "now". */
    readonly now?: Date;
  }): Promise<DashboardSummaryResponse> {
    const timeZone = await this.resolveTimeZone();
    const cached = await this.cache.readDashboardSummary(
      input.actorUserId,
      input.scope,
      timeZone,
    );
    if (cached !== null) {
      return cached;
    }
    return this.dashboardFlights.get(
      `${input.actorUserId}:${input.scope}:${timeZone}`,
      () => this.computeDashboardSummary(input, timeZone),
    );
  }

  private async computeDashboardSummary(
    input: {
      readonly actorUserId: string;
      readonly scope: DashboardSummaryScope;
      readonly now?: Date;
    },
    timeZone: string,
  ): Promise<DashboardSummaryResponse> {
    const now = input.now ?? new Date();
    const where = await this.scopeWhere(input.actorUserId, now);
    const scopeClause = ticketSummaryScopeClause(input.scope, input.actorUserId);
    const counts = await loadDashboardSummaryCounts(this.prisma, {
      where:
        where === null
          ? { id: { in: [] } }
          : scopeClause === null
            ? where
            : withTicketWhereClause(where, scopeClause),
      actorUserId: input.actorUserId,
      now,
      timeZone,
    });
    const response: DashboardSummaryResponse = {
      ...counts,
      scope: input.scope,
      generatedAt: now.toISOString(),
    };
    await this.cache.writeDashboardSummary(input.actorUserId, response, timeZone);
    return response;
  }

  async loadSlaSummary(input: {
    readonly actorUserId: string;
    /** Injected by the tests; the endpoints always use "now". */
    readonly now?: Date;
  }): Promise<SlaSummaryResponse> {
    const cached = await this.cache.readSlaSummary(input.actorUserId);
    if (cached !== null) {
      return cached;
    }
    return this.slaFlights.get(input.actorUserId, () =>
      this.computeSlaSummary(input),
    );
  }

  private async computeSlaSummary(input: {
    readonly actorUserId: string;
    readonly now?: Date;
  }): Promise<SlaSummaryResponse> {
    const now = input.now ?? new Date();
    const where = await this.scopeWhere(input.actorUserId, now);
    const counts = await loadSlaSummaryCounts(this.prisma, {
      where: where ?? { id: { in: [] } },
    });
    const response: SlaSummaryResponse = {
      ...counts,
      generatedAt: now.toISOString(),
    };
    await this.cache.writeSlaSummary(input.actorUserId, response);
    return response;
  }

  /**
   * The zone the reporting day starts in, from the installation settings. Read
   * per request: the value is one row and the counters behind it are cached
   * anyway, so a change takes effect with the next cache window instead of with
   * the next deploy.
   */
  private async resolveTimeZone(): Promise<string> {
    return readInstallationTimeZone(this.settingsService);
  }

  /**
   * The visible scope of the acting user, built by the ticket list's own
   * builder with an empty query (no filters, archived tickets hidden exactly as
   * `GET /tickets` hides them).
   */
  private async scopeWhere(
    actorUserId: string,
    now: Date,
  ): Promise<Awaited<ReturnType<typeof buildTicketListWhere>>> {
    try {
      return await buildTicketListWhere(
        this.prisma,
        this.authorizationContextLoader,
        {},
        { actorUserId },
        defaultTicketArchiveConfiguration,
        now,
      );
    } catch (error) {
      if (error instanceof TicketsError && error.code === 'FORBIDDEN') {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'Authorization failed',
        });
      }
      throw error;
    }
  }
}
