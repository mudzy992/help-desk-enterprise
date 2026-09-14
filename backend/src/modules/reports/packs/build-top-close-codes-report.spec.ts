import { buildTopCloseCodesReport } from './build-top-close-codes-report';
import { reportTicketSeed } from '../report-ticket-seed';
import type { ReportPackBuildInput } from '../reports.types';

const window = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-30T00:00:00.000Z'),
};

describe('buildTopCloseCodesReport', () => {
  it('counts close codes resolved or closed inside the window', () => {
    const rows = buildTopCloseCodesReport({
      window,
      tickets: [
        {
          ...reportTicketSeed({
            id: 'a',
            originUnitId: 'ou-it',
            status: 'RESOLVED',
            closeCodeId: 'cc-bug',
            resolvedAt: new Date('2026-09-10T00:00:00.000Z'),
          }),
          isOverdue: false,
        },
        {
          ...reportTicketSeed({
            id: 'b',
            originUnitId: 'ou-it',
            status: 'CLOSED',
            closeCodeId: 'cc-bug',
            closedAt: new Date('2026-09-12T00:00:00.000Z'),
          }),
          isOverdue: false,
        },
        {
          ...reportTicketSeed({
            id: 'c',
            originUnitId: 'ou-it',
            status: 'RESOLVED',
            closeCodeId: 'cc-howto',
            resolvedAt: new Date('2026-08-01T00:00:00.000Z'),
          }),
          isOverdue: false,
        },
      ],
      csatByTicketId: new Map(),
      closeCodesById: new Map([
        ['cc-bug', { id: 'cc-bug', key: 'bug_fixed', name: 'Bug Fixed' }],
        ['cc-howto', { id: 'cc-howto', key: 'howto', name: 'Howto' }],
      ]),
      articles: [],
      feedback: [],
    } satisfies ReportPackBuildInput);
    expect(rows).toEqual([
      { closeCodeKey: 'bug_fixed', closeCodeName: 'Bug Fixed', count: 2 },
    ]);
  });
});
