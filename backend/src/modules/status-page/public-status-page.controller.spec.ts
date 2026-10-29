import { toPublicStatusPage } from './public-status-page.controller';
import type { IncidentView, StatusPageView } from './status-page.service';

const incident = (id: string, visibility: string): IncidentView => ({
  id,
  title: 'T',
  titleEn: null,
  impact: 'DOWN',
  status: 'INVESTIGATING',
  visibility,
  startedAt: '2026-01-01T00:00:00.000Z',
  resolvedAt: null,
  revision: '2026-01-01T00:00:00.000Z',
  services: [],
  updates: [{ id: 'up', status: 'INVESTIGATING', message: 'm', createdAt: '2026-01-01T00:00:00.000Z', authorName: 'Agent Name' }],
  updatesHasMore: false,
  updatesNextCursor: null,
  linkedTicketCount: 4,
  subscriberCount: 2,
  subscribed: true,
});

describe('toPublicStatusPage', () => {
  it('drops staff-only incidents, author names, counters and settings flags', () => {
    const view: StatusPageView = {
      generatedAt: 'now',
      configuration: { enabled: true, public: true, historyDays: 90, showUptimePercent: true },
      canManage: true,
      affectedServiceCount: 1,
      servicesHasMore: false,
      plannedHasMore: false,
      categories: [],
      activeIncidents: [{ ...incident('a', 'ALL_USERS'), futureInternalField: 'secret' } as IncidentView, incident('b', 'STAFF_ONLY')],
      planned: [],
      history: [incident('c', 'STAFF_ONLY')],
    };
    const result = toPublicStatusPage(view);
    expect(result.activeIncidents.map((entry) => entry.id)).toEqual(['a']);
    expect(result.history).toEqual([]);
    expect(result.activeIncidents[0]).toMatchObject({ linkedTicketCount: null, subscriberCount: null, subscribed: false });
    expect(result.activeIncidents[0].updates[0].authorName).toBeNull();
    expect(result.activeIncidents[0]).not.toHaveProperty('futureInternalField');
    expect(result).not.toHaveProperty('canManage');
    expect(result.configuration).toEqual({ historyDays: 90, showUptimePercent: true });
  });
});

/** Extracted client-ip rule for unit testing without NestJS DI. */
function clientIp(request: { ip?: string; socket?: { remoteAddress?: string | null } }): string {
  if (request.ip && request.ip !== 'unknown' && request.ip !== '::1' && request.ip !== '127.0.0.1') {
    return request.ip;
  }
  return request.socket?.remoteAddress ?? 'unknown';
}

describe('clientIp', () => {
  it('uses request.ip when it is a real client address', () => {
    expect(clientIp({ ip: '10.0.0.5', socket: { remoteAddress: '127.0.0.1' } })).toBe('10.0.0.5');
  });

  it('treats unknown as missing and falls back to socket', () => {
    expect(clientIp({ ip: 'unknown', socket: { remoteAddress: '172.16.0.9' } })).toBe('172.16.0.9');
  });

  it('treats localhost as missing and falls back to socket', () => {
    expect(clientIp({ ip: '127.0.0.1', socket: { remoteAddress: '10.0.0.5' } })).toBe('10.0.0.5');
  });

  it('treats ::1 as missing and falls back to socket', () => {
    expect(clientIp({ ip: '::1', socket: { remoteAddress: '10.0.0.5' } })).toBe('10.0.0.5');
  });

  it('falls back to unknown when nothing is available', () => {
    expect(clientIp({ ip: undefined, socket: { remoteAddress: undefined } })).toBe('unknown');
  });

  it('uses request.ip when socket is missing', () => {
    expect(clientIp({ ip: '10.0.0.5', socket: undefined } as any)).toBe('10.0.0.5');
  });
});
