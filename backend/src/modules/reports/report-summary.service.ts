import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import { createSingleFlightCache } from "../../common/cache/single-flight-cache";
import { PrincipalContextLoader } from "../../common/principal-context/principal-context.loader";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthorizationContextLoader } from "../authorization/authorization-context.loader";
import { readInstallationTimeZone } from "../settings/read-installation-time-zone";
import type { SettingsService } from "../settings/settings.service";
import { defaultTicketArchiveConfiguration } from "../tickets/archive/archive.constants";
import { buildTicketListWhere } from "../tickets/list/build-ticket-list-where";
import { TicketsError } from "../tickets/tickets.error";
import { ReportSummaryCache } from "./report-summary.cache";
import { loadDashboardSummaryCounts } from "./summary/load-dashboard-summary-counts";
import { loadDashboardVolume } from "./summary/load-dashboard-volume";
import { loadSlaSummaryCounts } from "./summary/load-sla-summary-counts";
import type {
  DashboardSummaryResponse,
  SlaSummaryResponse,
} from "./summary/report-summary.types";

/**
 * the dashboard and SLA counters as server-side
 * aggregates.
 *
 * Both endpoints reuse the ticket list's scope (`buildTicketListWhere`) — the
 * same RBAC and visibility clauses, not a copy of them — and cache the answer
 * for a minute per user. the old `scope` parameter is gone; the
 * personal counters are fields of the same payload. The dashboard's "opened today"
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
  private readonly dashboardFlights =
    createSingleFlightCache<DashboardSummaryResponse>({
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
    /**
     * W7.100 (`BA-reports-10`): the summary is cached per user and must not outlive that user's authority. The
     * loader is the same fenced read the guards use (its `authzVersion` is checked against `User.authzVersion`), so
     * reading it here costs a memoized lookup inside the request, and a revoke changes the cache key immediately.
     * Optional so a direct `new ReportSummaryService(...)` in a unit test keeps working (version 0 = uncached
     * authority semantics, exactly the old behaviour).
     */
    @Optional() private readonly principalContextLoader?: PrincipalContextLoader,
  ) {}

  async loadDashboardSummary(input: {
    readonly actorUserId: string;
    /** Injected by the tests; the endpoints always use "now". */
    readonly now?: Date;
  }): Promise<DashboardSummaryResponse> {
    const [timeZone, authzVersion] = await Promise.all([
      this.resolveTimeZone(),
      this.authzVersionOf(input.actorUserId),
    ]);
    const cached = await this.cache.readDashboardSummary(
      input.actorUserId,
      authzVersion,
      timeZone,
    );
    if (cached !== null) {
      return cached;
    }
    return this.dashboardFlights.get(
      `${input.actorUserId}:v${authzVersion}:${timeZone}`,
      () => this.computeDashboardSummary(input, timeZone, authzVersion),
    );
  }

  private async computeDashboardSummary(
    input: {
      readonly actorUserId: string;
      readonly now?: Date;
    },
    timeZone: string,
    authzVersion: number,
  ): Promise<DashboardSummaryResponse> {
    const now = input.now ?? new Date();
    const where = await this.scopeWhere(input.actorUserId, now);
    // no scope clause any more — the counters match the ticket
    // list with an empty query (visibility from `buildTicketListWhere`), and the
    // personal counters travel inside the same payload.
    const visibleWhere = where === null ? { id: { in: [] } } : where;
    const [counts, volume14d] = await Promise.all([
      loadDashboardSummaryCounts(this.prisma, {
        where: visibleWhere,
        actorUserId: input.actorUserId,
        now,
        timeZone,
      }),
      loadDashboardVolume(this.prisma, { where: visibleWhere, now, timeZone }),
    ]);
    const response: DashboardSummaryResponse = {
      ...counts,
      generatedAt: now.toISOString(),
      volume14d,
    };
    await this.cache.writeDashboardSummary(
      input.actorUserId,
      authzVersion,
      response,
      timeZone,
    );
    return response;
  }

  async loadSlaSummary(input: {
    readonly actorUserId: string;
    /** Injected by the tests; the endpoints always use "now". */
    readonly now?: Date;
  }): Promise<SlaSummaryResponse> {
    const authzVersion = await this.authzVersionOf(input.actorUserId);
    const cached = await this.cache.readSlaSummary(
      input.actorUserId,
      authzVersion,
    );
    if (cached !== null) {
      return cached;
    }
    return this.slaFlights.get(
      `${input.actorUserId}:v${authzVersion}`,
      () => this.computeSlaSummary(input, authzVersion),
    );
  }

  private async computeSlaSummary(
    input: {
      readonly actorUserId: string;
      readonly now?: Date;
    },
    authzVersion: number,
  ): Promise<SlaSummaryResponse> {
    const now = input.now ?? new Date();
    const where = await this.scopeWhere(input.actorUserId, now);
    const counts = await loadSlaSummaryCounts(this.prisma, {
      where: where ?? { id: { in: [] } },
    });
    const response: SlaSummaryResponse = {
      ...counts,
      generatedAt: now.toISOString(),
    };
    await this.cache.writeSlaSummary(input.actorUserId, authzVersion, response);
    return response;
  }

  /**
   * The authority the cached counters were computed under. A `null` principal already fails closed in
   * `scopeWhere` (`FORBIDDEN`), so the fallback never caches a payload for a user without a context — it only keeps
   * the cache working for unit tests that construct the service without the loader.
   */
  private async authzVersionOf(actorUserId: string): Promise<number> {
    if (this.principalContextLoader === undefined) {
      return 0;
    }
    const principal = await this.principalContextLoader.load(actorUserId);
    return principal?.authzVersion ?? 0;
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
      if (error instanceof TicketsError && error.code === "FORBIDDEN") {
        throw new ForbiddenException({
          code: "FORBIDDEN",
          message: "Authorization failed",
        });
      }
      throw error;
    }
  }
}
