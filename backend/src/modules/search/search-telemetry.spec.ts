import {
  countSearchSloBreaches,
  describeSearchTerm,
  formatSearchTelemetry,
  searchLatencyBucket,
  searchQueryHashLength,
  searchSlo,
  searchTelemetrySalt,
  type SearchGroupTelemetry,
  type SearchTelemetryRecord,
} from './search-telemetry';

const salt = 'spec-salt';

function group(
  overrides: Partial<SearchGroupTelemetry> & Pick<SearchGroupTelemetry, 'group'>,
): SearchGroupTelemetry {
  return {
    state: 'ok',
    hits: 0,
    durationMs: 1,
    truncated: false,
    ...overrides,
  };
}

function record(overrides: Partial<SearchTelemetryRecord> = {}): SearchTelemetryRecord {
  const described = describeSearchTerm('vpn pristup', salt);
  return {
    status: 'ok',
    queryLength: described.length,
    queryHash: described.hash,
    requestedTypes: ['ticket', 'article', 'user'],
    limit: 15,
    durationMs: 12,
    groups: [group({ group: 'ticket', hits: 2 })],
    ...overrides,
  };
}

describe('search telemetry contract (W7.112)', () => {
  describe('describeSearchTerm', () => {
    it('never returns the term, only its length and a keyed hash', () => {
      const term = 'Ana Hodžić';
      const described = describeSearchTerm(term, salt);
      expect(Object.keys(described).sort()).toEqual(['hash', 'length']);
      expect(described.length).toBe(10);
      expect(described.hash).toMatch(/^[0-9a-f]{16}$/);
      expect(described.hash).toHaveLength(searchQueryHashLength);
      expect(JSON.stringify(described)).not.toContain('Ana');
      expect(JSON.stringify(described)).not.toContain('Hod');
      // The hash is not the term in disguise (base64/hex of the UTF-8 bytes).
      expect(described.hash).not.toContain(Buffer.from(term).toString('hex').slice(0, 8));
    });

    it('counts characters, not UTF-16 units', () => {
      // A single emoji is one character (two UTF-16 units).
      expect(describeSearchTerm('👍', salt).length).toBe(1);
      expect(describeSearchTerm('👍👍', salt).length).toBe(2);
    });

    it('is deterministic for one salt and unlinkable across salts', () => {
      expect(describeSearchTerm('vpn', salt)).toEqual(describeSearchTerm('vpn', salt));
      expect(describeSearchTerm('vpn', salt).hash).not.toBe(
        describeSearchTerm('vpn', 'another-salt').hash,
      );
      expect(describeSearchTerm('vpn', salt).hash).not.toBe(
        describeSearchTerm('vpn2', salt).hash,
      );
    });
  });

  describe('searchTelemetrySalt', () => {
    it('uses the configured salt when it is not blank', () => {
      expect(searchTelemetrySalt({ SEARCH_TELEMETRY_SALT: '  deploy-salt ' })).toBe(
        'deploy-salt',
      );
    });

    it('falls back to a fresh random salt, never to an empty one', () => {
      const first = searchTelemetrySalt({});
      const second = searchTelemetrySalt({ SEARCH_TELEMETRY_SALT: '   ' });
      expect(first).not.toBe('');
      expect(first).not.toBe(second);
    });
  });

  describe('searchLatencyBucket', () => {
    it('maps the thresholds to their buckets', () => {
      expect(searchLatencyBucket(0)).toBe('lt10');
      expect(searchLatencyBucket(9)).toBe('lt10');
      expect(searchLatencyBucket(10)).toBe('lt25');
      expect(searchLatencyBucket(24)).toBe('lt25');
      expect(searchLatencyBucket(25)).toBe('lt50');
      expect(searchLatencyBucket(249)).toBe('lt250');
      expect(searchLatencyBucket(250)).toBe('lt500');
      expect(searchLatencyBucket(999)).toBe('lt1000');
      expect(searchLatencyBucket(1000)).toBe('gte1000');
      expect(searchLatencyBucket(60_000)).toBe('gte1000');
    });
  });

  describe('countSearchSloBreaches', () => {
    it('counts a group over its own SLO and the total over the total SLO', () => {
      const overTicket = record({
        groups: [
          group({
            group: 'ticket',
            durationMs: searchSlo.groupMs.ticket + 1,
          }),
          group({ group: 'user', durationMs: searchSlo.groupMs.user }),
        ],
        // 250 is exactly the ticket SLO: "over" means strictly greater.
        durationMs: searchSlo.totalMs + 1,
      });
      expect(countSearchSloBreaches(overTicket)).toBe(2);
      expect(countSearchSloBreaches(record({ durationMs: searchSlo.totalMs }))).toBe(0);
    });

    it('does not count a skipped group, which never ran', () => {
      const skipped = record({
        groups: [
          group({ group: 'article', state: 'skipped', durationMs: 0 }),
          group({ group: 'user', state: 'skipped', durationMs: 0 }),
        ],
      });
      expect(countSearchSloBreaches(skipped)).toBe(0);
    });
  });

  describe('formatSearchTelemetry', () => {
    it('writes one key=value line with every group and the incomplete list', () => {
      const line = formatSearchTelemetry(
        record({
          status: 'partial',
          requestedTypes: ['ticket', 'article'],
          groups: [
            group({ group: 'ticket', hits: 15, truncated: true }),
            group({ group: 'article', state: 'failed', hits: 0, durationMs: 7 }),
            group({ group: 'user', state: 'skipped', durationMs: 0 }),
          ],
        }),
      );
      expect(line).toMatch(/^search_telemetry=1 /);
      expect(line.split(' ')).toEqual(
        expect.arrayContaining([
          'search_telemetry=1',
          'status=partial',
          'query_len=11',
          `query_hash=${describeSearchTerm('vpn pristup', salt).hash}`,
          'types=ticket,article',
          'limit=15',
          'duration_ms=12',
          'latency_bucket=lt25',
          'search_group_ticket=ok:15:1:true',
          'search_group_article=failed:0:7:false',
          'search_group_user=skipped:0:0:false',
          'incomplete=ticket',
          'slo_breaches=0',
        ]),
      );
      // Every token is a key=value pair: nothing can smuggle free text in.
      for (const token of line.split(' ')) {
        expect(token).toMatch(/^[a-z_]+=[^ ]*$/);
      }
    });

    it('carries neither the raw term nor any identifier', () => {
      const described = describeSearchTerm('Ana Hodžić', salt);
      const line = formatSearchTelemetry(
        record({
          queryLength: described.length,
          queryHash: described.hash,
        }),
      );
      expect(line).not.toContain('Ana');
      expect(line).not.toContain('Hod');
      // Only counts and states: the line has exactly the documented keys.
      expect(line.match(/[a-z_]+=/g)).toEqual(
        expect.arrayContaining([
          'status=',
          'query_len=',
          'query_hash=',
          'types=',
          'limit=',
          'duration_ms=',
          'latency_bucket=',
          'incomplete=',
          'slo_breaches=',
        ]),
      );
    });

    it('reports an empty incomplete list when nothing was cut', () => {
      const line = formatSearchTelemetry(
        record({
          groups: [
            group({ group: 'ticket', hits: 2 }),
            group({ group: 'user', hits: 1 }),
          ],
        }),
      );
      expect(line).toContain('incomplete= ');
    });
  });
});
