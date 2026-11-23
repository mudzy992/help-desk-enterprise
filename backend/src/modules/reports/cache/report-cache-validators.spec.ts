import { parseReportDashboardCache } from './parse-report-dashboard-cache';
import { parseReportTrendsCache } from './parse-report-trends-cache';
import { reportCacheCollectionCap } from './report-cache-envelope';

/*
  W7.105 (BA-reports-15): the two big payloads — dashboard and trends — used to be checked only at the top level.
  These tests pin the fields the screens actually read: a value with the right keys but a broken nested number, a
  missing object or an unknown granularity must be a miss, because the alternative is `NaN`/`undefined` on screen.
*/
const dashboard = {
  timeZone: 'Europe/Sarajevo',
  window: { from: '2026-08-29T07:00:00.000Z', to: '2026-09-28T07:00:00.000Z' },
  previousWindow: { from: '2026-07-30T07:00:00.000Z', to: '2026-08-29T06:59:59.999Z' },
  ticketCount: 7,
  kpis: {
    createdCount: 7,
    createdDeltaPercent: null,
    firstResponseMinutes: 12,
    firstResponseSampleCount: 3,
    firstResponseDeltaMinutes: null,
    resolutionHours: 8,
    resolutionSampleCount: 2,
    resolutionDeltaHours: null,
    csatAverage: null,
    csatCount: 0,
    csatScaleMax: 5,
    kbHelpedCount: 0,
    kbResolutionRate: null,
  },
  bottlenecksEnabled: true,
  bottleneckByGroup: [{ key: 'g1', label: 'Grupa', value: 1 }],
  serviceVolume: [{ key: 's1', label: 'Servis', value: 2 }],
  originUnitVolume: [{ key: 'ou', label: 'Jedinica', value: 3 }],
  assigneeWorkload: [{ key: 'u1', label: 'Agent', value: 4 }],
  volumeSeries: [{ d: '2026-09-01T00:00:00.000Z', created: 1, resolved: 0 }],
  aging: {
    lessThanOneDay: 1,
    oneToThreeDays: 2,
    threeToSevenDays: 3,
    moreThanSevenDays: 4,
    waitingOverSevenDays: 5,
  },
};

describe('parseReportDashboardCache', () => {
  it('accepts a payload written by this build', () => {
    expect(parseReportDashboardCache(dashboard)).toBe(dashboard);
  });

  it.each([
    ['an array instead of a record', []],
    ['a missing window', { ...dashboard, window: undefined }],
    ['a window with a broken bound', { ...dashboard, window: { from: 'x', to: 'y' } }],
    ['a negative ticket count', { ...dashboard, ticketCount: -1 }],
    ['a fractional ticket count', { ...dashboard, ticketCount: 1.5 }],
    ['a missing kpis object', { ...dashboard, kpis: {} }],
    ['a kpis string where a counter belongs', { ...dashboard, kpis: { ...dashboard.kpis, createdCount: '7' } }],
    ['a csat scale of zero', { ...dashboard, kpis: { ...dashboard.kpis, csatScaleMax: 0 } }],
    ['a bar without a label', { ...dashboard, serviceVolume: [{ key: 's1', value: 2 }] }],
    ['a bar with a negative value', { ...dashboard, assigneeWorkload: [{ key: 'u1', label: 'A', value: -2 }] }],
    ['a volume point without a date', { ...dashboard, volumeSeries: [{ created: 1, resolved: 0 }] }],
    ['an aging bucket that is missing', { ...dashboard, aging: { lessThanOneDay: 1 } }],
    ['a collection over the cap', {
      ...dashboard,
      bottleneckByGroup: Array.from({ length: reportCacheCollectionCap + 1 }, () => ({ key: 'g', label: 'G', value: 1 })),
    }],
  ])('rejects %s', (_label, value) => {
    expect(parseReportDashboardCache(value)).toBeNull();
  });
});

function trends() {
  const ratio = { total: 3, met: 2, percent: 66.67 };
  const duration = { medianHours: 4, p90Hours: 9, sampleCount: 3 };
  return {
    granularity: 'day',
    timeZone: 'Europe/Sarajevo',
    window: { from: '2026-09-01T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' },
    previousWindow: { from: '2026-08-25T00:00:00.000Z', to: '2026-08-31T23:59:59.999Z' },
    generatedAt: '2026-09-08T00:00:00.000Z',
    filters: { organizationalUnitId: 'ou', serviceId: null, groupId: null, priority: 'HIGH' },
    points: [
      {
        key: '2026-09-01',
        start: '2026-09-01T00:00:00.000Z',
        end: '2026-09-02T00:00:00.000Z',
        partial: false,
        created: 4,
        resolved: 3,
        net: 1,
        backlog: 12,
        firstResponse: duration,
        resolution: duration,
        slaResponse: ratio,
        slaResolution: ratio,
        csat: { count: 2, average: 4.5, satisfiedPercent: 50, lowSample: true },
      },
    ],
    totals: {
      created: 4,
      resolved: 3,
      net: 1,
      backlogStart: 10,
      backlogEnd: 12,
      slaResponse: ratio,
      slaResolution: ratio,
      csat: { count: 2, average: 4.5, satisfiedPercent: 50, lowSample: true },
      resolvedWithoutSla: 1,
    },
    topServices: {
      items: [
        {
          serviceId: 's1',
          name: 'Servis',
          current: 4,
          previous: 3,
          changePercent: 33.33,
        },
      ],
      other: { current: 0, previous: 0 },
      totalCurrent: 4,
      totalPrevious: 3,
    },
    settings: {
      slaTargetPercent: 90,
      csatMinSample: 5,
      csatScaleMax: 5,
      csatSatisfiedMinRating: 4,
    },
  };
}

describe('parseReportTrendsCache', () => {
  it('accepts a payload written by this build, including a negative net', () => {
    const payload = trends();
    payload.points[0]!.net = -2;
    expect(parseReportTrendsCache(payload)).toBe(payload);
  });

  it.each([
    ['an unknown granularity (a value from another build)', { ...trends(), granularity: 'quarter' }],
    ['a missing filters object', { ...trends(), filters: null }],
    ['a filter without an organizational unit', { ...trends(), filters: { ...trends().filters, organizationalUnitId: '' } }],
    ['a non-parsable generatedAt', { ...trends(), generatedAt: 'yesterday' }],
    ['points that are not an array', { ...trends(), points: {} }],
    ['a point with a broken duration', {
      ...trends(),
      points: [{ ...trends().points[0]!, resolution: { medianHours: 1, p90Hours: 2 } }],
    }],
    ['a point with a negative created count', {
      ...trends(),
      points: [{ ...trends().points[0]!, created: -1 }],
    }],
    ['a point whose backlog is fractional', {
      ...trends(),
      points: [{ ...trends().points[0]!, backlog: 1.5 }],
    }],
    ['totals without the CSAT block', { ...trends(), totals: { ...trends().totals, csat: {} } }],
    ['top services with a broken item', {
      ...trends(),
      topServices: { ...trends().topServices, items: [{ serviceId: 's1' }] },
    }],
    ['settings with a zero CSAT scale', { ...trends(), settings: { ...trends().settings, csatScaleMax: 0 } }],
    ['points over the cap', {
      ...trends(),
      points: Array.from({ length: reportCacheCollectionCap + 1 }, () => trends().points[0]!),
    }],
  ])('rejects %s', (_label, value) => {
    expect(parseReportTrendsCache(value)).toBeNull();
  });
});
