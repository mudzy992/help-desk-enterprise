import { requestIdHeaderName } from './request-context.constants';
import { takeDbQueryCount } from '../database/db-query-counter';

/**
 * Emits one post-response line per request so log aggregation can answer the
 * Phase 0 questions: how many statements a request costs and how long it took.
 *
 * The middleware never awaits inside the request path — everything happens in
 * the `finish` listener, after the response has been written.
 */

export type RequestMetricsLogger = {
  log(message: string, context?: string): void;
  warn(message: string, context?: string): void;
};

export type RequestMetricsOptions = {
  readonly enabled: boolean;
  readonly warnAboveQueries: number;
  readonly warnEnabled: boolean;
};

export const defaultRequestMetricsOptions: RequestMetricsOptions = {
  enabled: true,
  warnAboveQueries: 3,
  warnEnabled: false,
};

export const requestMetricsLogContext = 'RequestMetrics';

type MetricsIncoming = {
  readonly headers: Record<string, unknown>;
  readonly method?: string;
  readonly originalUrl?: string;
  readonly url?: string;
};

type MetricsOutgoing = {
  readonly statusCode?: number;
  once(event: 'finish', listener: () => void): unknown;
};

/** Reads the knobs from the environment; unknown values keep the default. */
export function readRequestMetricsOptions(
  env: NodeJS.ProcessEnv = process.env,
): RequestMetricsOptions {
  return {
    enabled: readBoolean(env.DB_QUERY_METRICS, defaultRequestMetricsOptions.enabled),
    warnAboveQueries: readNumber(
      env.DB_QUERY_BUDGET,
      defaultRequestMetricsOptions.warnAboveQueries,
    ),
    warnEnabled: readBoolean(
      env.DB_QUERY_BUDGET_WARN,
      defaultRequestMetricsOptions.warnEnabled,
    ),
  };
}

export class RequestMetricsMiddleware {
  constructor(
    private readonly logger: RequestMetricsLogger,
    private readonly options: RequestMetricsOptions = readRequestMetricsOptions(),
  ) {}

  use(
    request: MetricsIncoming,
    response: MetricsOutgoing,
    next: () => void,
  ): void {
    if (!this.options.enabled) {
      next();
      return;
    }
    const startedAt = process.hrtime.bigint();
    const requestId = readRequestId(request.headers);
    response.once('finish', () => {
      this.report(request, response, requestId, startedAt);
    });
    next();
  }

  private report(
    request: MetricsIncoming,
    response: MetricsOutgoing,
    requestId: string | null,
    startedAt: bigint,
  ): void {
    const queryCount = requestId === null ? 0 : takeDbQueryCount(requestId);
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const message =
      `db_queries_per_request=${queryCount}` +
      ` duration_ms=${durationMs.toFixed(1)}` +
      ` status=${response.statusCode ?? 0}` +
      ` method=${request.method ?? 'UNKNOWN'}` +
      ` path=${readPath(request)}`;
    this.logger.log(message, requestMetricsLogContext);
    if (this.options.warnEnabled && queryCount > this.options.warnAboveQueries) {
      // Phase 4.2 (plan §4.2, item 2): the warning has to be actionable on its own,
      // so it carries the correlation id that ties it back to the request log line
      // and to the endpoint that overspent its query budget.
      this.logger.warn(
        `query_budget_exceeded request_id=${requestId ?? 'unknown'} ${message} budget=${this.options.warnAboveQueries}`,
        requestMetricsLogContext,
      );
    }
  }
}

function readRequestId(headers: Record<string, unknown>): string | null {
  const value = headers[requestIdHeaderName];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPath(request: MetricsIncoming): string {
  const raw = request.originalUrl ?? request.url ?? '/';
  const queryStart = raw.indexOf('?');
  return queryStart === -1 ? raw : raw.slice(0, queryStart);
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  return value.trim().toLowerCase() !== 'false';
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
