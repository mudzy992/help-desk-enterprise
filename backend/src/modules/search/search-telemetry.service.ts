import { Injectable, Logger } from '@nestjs/common';
import {
  countSearchSloBreaches,
  describeSearchTerm,
  formatSearchTelemetry,
  searchTelemetrySalt,
  type SearchTelemetryRecord,
} from './search-telemetry';

/**
 * W7.112 (`BA-search-11`): the sink of the search telemetry contract
 * (`search-telemetry.ts`). It writes **one** log line per answered request and
 * never throws: telemetry is an observer, not a step of the request.
 *
 * Log level is part of the contract — a request inside its SLO is `log`, a
 * request that breached the per-group or total SLO is `warn` (that is what an
 * operator alerts on), and the line is identical in both cases so a query can
 * aggregate over one shape.
 */
@Injectable()
export class SearchTelemetry {
  private readonly logger = new Logger(SearchTelemetry.name);
  private readonly salt = searchTelemetrySalt();

  /**
   * The only way the needle enters telemetry: the sink reduces it to
   * `{ length, hash }` with its own salt. The service never sees the salt and
   * never formats the term itself.
   */
  describeTerm(term: string): { readonly length: number; readonly hash: string } {
    return describeSearchTerm(term, this.salt);
  }

  record(record: SearchTelemetryRecord): void {
    try {
      const line = formatSearchTelemetry(record);
      if (countSearchSloBreaches(record) > 0) {
        this.logger.warn(line);
        return;
      }
      this.logger.log(line);
    } catch {
      // A logger that cannot write (or a record the formatter rejects) must not
      // change the answer the caller already has. Telemetry is best effort.
    }
  }
}
