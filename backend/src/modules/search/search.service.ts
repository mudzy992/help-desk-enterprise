import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { TicketsService } from '../tickets/tickets.service';
import type { TicketMutationContext } from '../tickets/tickets.types';
import {
  countSearchQueryCharacters,
  isUsableSearchQuery,
  normalizeSearchQuery,
} from './normalize-search-query';
import { searchConstants } from './search.constants';
import {
  resolveDirectorySearchGrant,
  resolveDirectorySearchScope,
} from './search-directory-scope';
import { isFatalSearchGroupFailure } from './search-group-failure';
import {
  type SearchGroupTelemetry,
  type SearchRequestStatus,
  type SearchTelemetryRecord,
} from './search-telemetry';
import { SearchTelemetry } from './search-telemetry.service';
import { searchDirectoryUsers } from './search-users';
import type {
  SearchGroupName,
  SearchQuery,
  SearchResponse,
} from './search.types';

/**
 * `GET /search` (plan §1.2): one request, three parallel groups, each narrowed
 * by the visibility rules of the list it belongs to. The service adds no rules
 * of its own — it calls the ticket list query, the knowledge-base visibility
 * check and the directory read that already exist.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly ticketsService: TicketsService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    // W7.112 (BA-search-11): the observer is optional so a unit test or a
    // hand-built service keeps working; the module always provides it.
    @Optional() private readonly telemetry?: SearchTelemetry,
  ) {}

  async search(
    query: SearchQuery,
    context: TicketMutationContext,
  ): Promise<SearchResponse> {
    // W7.56: the HTTP path normalizes and validates `q` in the DTO; the service
    // repeats both so a caller that builds `SearchQuery` by hand can never send
    // an empty needle (an empty `contains` matches the newest rows of a group).
    const usable = this.requireUsableQuery(query);
    const types = new Set(query.types);
    const startedAt = Date.now();
    // W7.62 (BA-search-08): the groups settle independently so one unavailable
    // dependency cannot take the other answers down with it — but every outcome
    // is classified before anything is returned (see `search-group-failure.ts`):
    // an authorization failure still fails the whole request.
    const [ticketOutcome, articleOutcome, userOutcome] = await Promise.all([
      readSearchGroup(types.has('ticket'), () =>
        this.ticketsService.searchTickets(
          { q: usable.q, limit: usable.limit },
          context,
        ),
      ),
      // W7.57 (BA-search-03): the article group is a bounded keyset scan, so it
      // also reports whether it had to stop early. A group that was not
      // requested is not "incomplete" — it is simply absent.
      readSearchGroup(types.has('article'), () =>
        this.knowledgeBaseService.searchTitles(
          { q: usable.q, limit: usable.limit },
          context,
        ),
      ),
      readSearchGroup(types.has('user'), () => this.searchUsers(usable, context)),
    ]);

    const outcomes: readonly { group: SearchGroupName; outcome: SearchGroupOutcome<unknown> }[] = [
      { group: 'ticket', outcome: ticketOutcome },
      { group: 'article', outcome: articleOutcome },
      { group: 'user', outcome: userOutcome },
    ];
    // W7.112 (BA-search-11): the telemetry draft is built from the same outcomes
    // the answer is built from, so the line can never describe a different run.
    // It carries counts, states and durations — never the needle or a matched id.
    const groups: readonly SearchGroupTelemetry[] = [
      toGroupTelemetry(
        'ticket',
        ticketOutcome,
        ticketOutcome.kind === 'ok' ? ticketOutcome.value.length : 0,
        usable.limit,
      ),
      toGroupTelemetry(
        'article',
        articleOutcome,
        articleOutcome.kind === 'ok' ? articleOutcome.value.items.length : 0,
        usable.limit,
        articleOutcome.kind === 'ok' && articleOutcome.value.incomplete,
      ),
      toGroupTelemetry(
        'user',
        userOutcome,
        userOutcome.kind === 'ok' ? userOutcome.value.length : 0,
        usable.limit,
      ),
    ];
    const emitTelemetry = (status: SearchRequestStatus): void =>
      this.emitTelemetry({
        status,
        term: usable.q,
        requestedTypes: [...types],
        limit: usable.limit,
        startedAt,
        groups,
      });
    const fatal = outcomes.find(
      (entry) => entry.outcome.kind === 'failed' && isFatalSearchGroupFailure(entry.outcome.error),
    );
    if (fatal !== undefined && fatal.outcome.kind === 'failed') {
      // Fail-closed: 401/403 and other client errors are decisions about this
      // request, never a group that "happened to be empty".
      emitTelemetry('rejected');
      throw fatal.outcome.error;
    }
    const failedGroups = outcomes
      .filter((entry) => entry.outcome.kind === 'failed')
      .map((entry) => entry.group);
    if (failedGroups.length > 0 && failedGroups.length === outcomes.length) {
      // Nothing could be read: there is no partial answer to give, so the
      // endpoint says so instead of returning three empty groups.
      emitTelemetry('unavailable');
      throw new ServiceUnavailableException({
        code: 'SEARCH_UNAVAILABLE',
        message: 'The search groups are temporarily unavailable',
        details: { failedGroups },
      });
    }
    const articles =
      articleOutcome.kind === 'ok'
        ? articleOutcome.value
        : { items: [], incomplete: false };
    emitTelemetry(failedGroups.length > 0 ? 'partial' : 'ok');
    return {
      tickets: ticketOutcome.kind === 'ok' ? ticketOutcome.value : [],
      articles: articles.items,
      users: userOutcome.kind === 'ok' ? userOutcome.value : [],
      // The scan-completeness flag belongs to a group that actually answered;
      // a failed group is reported in `failedGroups` instead.
      articlesIncomplete: articles.incomplete,
      failedGroups: failedGroups.filter(
        (group) => types.has(group),
      ),
    };
  }

  private requireUsableQuery(query: SearchQuery): SearchQuery {
    const q = normalizeSearchQuery(query.q);
    if (!isUsableSearchQuery(q)) {
      throw new BadRequestException(
        `q must contain between ${searchConstants.minimumQueryLength} and ` +
          `${searchConstants.maximumQueryLength} characters after normalization ` +
          `(got ${countSearchQueryCharacters(q)})`,
      );
    }
    return { ...query, q };
  }

  /**
   * W7.112 (BA-search-11): one best-effort telemetry line per answered request.
   * The needle is handed to the sink, which reduces it to length + keyed hash —
   * the raw term never reaches the record. Nothing here may change the answer:
   * a missing or failing observer is silently ignored.
   */
  private emitTelemetry(input: {
    readonly status: SearchRequestStatus;
    readonly term: string;
    readonly requestedTypes: readonly SearchGroupName[];
    readonly limit: number;
    readonly startedAt: number;
    readonly groups: readonly SearchGroupTelemetry[];
  }): void {
    const telemetry = this.telemetry;
    if (telemetry === undefined) {
      return;
    }
    try {
      const described = telemetry.describeTerm(input.term);
      const record: SearchTelemetryRecord = {
        status: input.status,
        queryLength: described.length,
        queryHash: described.hash,
        requestedTypes: input.requestedTypes,
        limit: input.limit,
        durationMs: Math.max(Date.now() - input.startedAt, 0),
        groups: input.groups,
      };
      telemetry.record(record);
    } catch {
      // Telemetry is an observer: it never fails a search.
    }
  }

  private async searchUsers(
    query: SearchQuery,
    context: TicketMutationContext,
  ) {
    const authorization = await this.authorizationContextLoader.loadBySubjectId(
      context.actorUserId,
    );
    if (authorization === null) {
      return [];
    }
    // W7.55: the grant is a permission and the reach is an organizational-unit
    // subtree; the unit table is read only when a scoped grant needs it.
    const grant = resolveDirectorySearchGrant(authorization);
    const scope = resolveDirectorySearchScope({
      grant,
      organizationalUnits:
        grant.kind === 'organizationalUnits'
          ? await this.prisma.organizationalUnit.findMany({
              select: { id: true, ouPath: true },
            })
          : [],
    });
    return searchDirectoryUsers({
      prisma: this.prisma,
      query: query.q,
      limit: query.limit,
      scope,
    });
  }
}

/**
 * Outcome of one requested group. `skipped` is a group the caller did not ask
 * for: it is neither answered nor failed, and it must never appear in
 * `failedGroups`.
 */
type SearchGroupOutcome<T> =
  | { readonly kind: 'skipped'; readonly durationMs: number }
  | { readonly kind: 'ok'; readonly value: T; readonly durationMs: number }
  | { readonly kind: 'failed'; readonly error: unknown; readonly durationMs: number };

async function readSearchGroup<T>(
  requested: boolean,
  read: () => Promise<T>,
): Promise<SearchGroupOutcome<T>> {
  if (!requested) {
    // A group that was not requested did not cost anything, so it reports no
    // duration rather than a measured zero.
    return { kind: 'skipped', durationMs: 0 };
  }
  const startedAt = Date.now();
  try {
    return { kind: 'ok', value: await read(), durationMs: Date.now() - startedAt };
  } catch (error) {
    return { kind: 'failed', error, durationMs: Date.now() - startedAt };
  }
}

/**
 * W7.112 (BA-search-11): one group of the telemetry draft. `truncated` marks a
 * group whose answer is not exhaustive — the article scan stopped at its budget,
 * or a group returned exactly `limit` rows so more may exist. It is a server-side
 * signal only; the response keeps `articlesIncomplete` for the article group.
 */
function toGroupTelemetry(
  group: SearchGroupName,
  outcome: SearchGroupOutcome<unknown>,
  hits: number,
  limit: number,
  scanIncomplete = false,
): SearchGroupTelemetry {
  if (outcome.kind === 'skipped') {
    return { group, state: 'skipped', hits: 0, durationMs: 0, truncated: false };
  }
  if (outcome.kind === 'failed') {
    return {
      group,
      state: 'failed',
      hits: 0,
      durationMs: outcome.durationMs,
      truncated: false,
    };
  }
  return {
    group,
    state: 'ok',
    hits,
    durationMs: outcome.durationMs,
    truncated: scanIncomplete || hits === limit,
  };
}
