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
  services: [],
  updates: [{ id: 'up', status: 'INVESTIGATING', message: 'm', createdAt: '2026-01-01T00:00:00.000Z', authorName: 'Agent Name' }],
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
      categories: [],
      activeIncidents: [incident('a', 'ALL_USERS'), incident('b', 'STAFF_ONLY')],
      planned: [],
      history: [incident('c', 'STAFF_ONLY')],
    };
    const result = toPublicStatusPage(view);
    expect(result.activeIncidents.map((entry) => entry.id)).toEqual(['a']);
    expect(result.history).toEqual([]);
    expect(result.activeIncidents[0]).toMatchObject({ linkedTicketCount: null, subscriberCount: null, subscribed: false });
    expect(result.activeIncidents[0].updates[0].authorName).toBeNull();
    expect(result).not.toHaveProperty('canManage');
    expect(result.configuration).toEqual({ historyDays: 90, showUptimePercent: true });
  });
});
