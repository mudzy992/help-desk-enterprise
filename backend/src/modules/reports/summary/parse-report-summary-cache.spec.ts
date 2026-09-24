import type { DashboardSummaryResponse } from './report-summary.types';
import {
  parseDashboardSummaryResponse,
  parseSlaSummaryResponse,
} from './parse-report-summary-cache';

const dashboardPayload: DashboardSummaryResponse = {
  scope: 'all',
  generatedAt: '2026-09-24T10:00:00.000Z',
  total: 1,
  open: 1,
  critical: 0,
  overdue: 0,
  openedToday: 1,
  waitingForUser: 0,
  pendingApproval: 0,
  resolved: 0,
  closed: 0,
  unrouted: 0,
  unassigned: 0,
  assignedToMe: 0,
  requestedByMe: 1,
  statusCounts: [{ status: 'PENDING', count: 1 }],
  priorityCounts: [{ priority: 'LOW', count: 1 }],
};

describe('parseDashboardSummaryResponse', () => {
  it('accepts a payload written by this build', () => {
    expect(parseDashboardSummaryResponse(dashboardPayload)).toEqual(dashboardPayload);
  });

  it.each([
    ['not an object', 'nope'],
    ['unknown scope', { ...dashboardPayload, scope: 'team' }],
    ['missing counter', { ...dashboardPayload, overdue: undefined }],
    ['counter as string', { ...dashboardPayload, total: '4' }],
    ['statusCounts not an array', { ...dashboardPayload, statusCounts: null }],
  ])('rejects %s', (_label, value) => {
    expect(parseDashboardSummaryResponse(value)).toBeNull();
  });
});

describe('parseSlaSummaryResponse', () => {
  const slaPayload = {
    generatedAt: '2026-09-24T10:00:00.000Z',
    totals: { open: 2, onTrack: 1, atRisk: 1, breached: 0 },
    profiles: [
      {
        slaProfileId: 'profile-standard',
        exposure: { open: 2, onTrack: 1, atRisk: 1, breached: 0 },
        priorities: [
          {
            priority: 'HIGH',
            exposure: { open: 2, onTrack: 1, atRisk: 1, breached: 0 },
          },
        ],
      },
    ],
  };

  it('accepts a payload written by this build', () => {
    expect(parseSlaSummaryResponse(slaPayload)).toEqual(slaPayload);
  });

  it.each([
    ['missing generatedAt', { ...slaPayload, generatedAt: 5 }],
    ['broken totals', { ...slaPayload, totals: { open: 2 } }],
    ['profiles not an array', { ...slaPayload, profiles: {} }],
    [
      'profile without an id',
      { ...slaPayload, profiles: [{ exposure: slaPayload.totals, priorities: [] }] },
    ],
    [
      'profile with a broken exposure',
      {
        ...slaPayload,
        profiles: [
          { slaProfileId: 'p', exposure: { open: 1 }, priorities: [] },
        ],
      },
    ],
  ])('rejects %s', (_label, value) => {
    expect(parseSlaSummaryResponse(value)).toBeNull();
  });
});
