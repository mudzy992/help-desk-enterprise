import { loadBottleneckDashboardFromSql } from './sql-bottleneck-dashboard-store';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const window = {
  from: new Date('2026-09-01T00:00:00.000Z'),
  to: new Date('2026-09-03T23:59:59.999Z'),
};

type Query = { readonly sql: string; readonly values: readonly unknown[] };

function fakePrisma(queries: Query[], rows: readonly unknown[][]) {
  let index = 0;
  return {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ sql: strings.join('?'), values });
      return Promise.resolve(rows[index++] ?? []);
    },
  } as never;
}

/** `sqltag` keeps nested fragments as `{ strings, values }` objects. */
function sqlFragmentText(values: readonly unknown[]): string {
  return values
    .flatMap((value) => {
      const fragment = value as { strings?: unknown };
      return Array.isArray(fragment?.strings) ? (fragment.strings as string[]) : [];
    })
    .join('\n');
}

const breakdownRows = [
  // g: 0 = total, 1 = unit, 2 = service, 3 = priority
  { g: 0, key: null, unitName: null, serviceName: null, pa: 1, wu: 0, ur: 1, od: 0 },
  { g: 1, key: 'ou-it', unitName: 'IT Ops', serviceName: null, pa: 0, wu: 0, ur: 1, od: 0 },
  // Jedinica bez zapisa u šifarniku (obrisana) pada natrag na ključ.
  { g: 1, key: 'ou-gone', unitName: null, serviceName: null, pa: 1, wu: 0, ur: 0, od: 0 },
  {
    g: 2,
    key: 'svc-vpn',
    unitName: null,
    serviceName: 'Pristup mreži',
    pa: 0,
    wu: 0,
    ur: 1,
    od: 0,
  },
  // Prioritet nema šifarnik: labela je vrijednost enuma, prevodi je UI.
  { g: 3, key: 'HIGH', unitName: null, serviceName: null, pa: 1, wu: 0, ur: 0, od: 0 },
];

/**
 * Val 1 (M15/B2): the SQL dashboard used to return only the grouping key, so
 * /reports printed ids. These tests pin the JOIN + label mapping down without a
 * database; the reference spec for the in-memory path is
 * `aggregate-bottleneck-dashboard.spec.ts`.
 */
describe('loadBottleneckDashboardFromSql labels', () => {
  it('spaja šifarnike i vraća nazive uz ključeve', async () => {
    const queries: Query[] = [];
    const dashboard = await loadBottleneckDashboardFromSql(
      fakePrisma(queries, [breakdownRows, []]),
      ['ou-it'],
      window,
    );

    // Uz same grupe se čitaju i nazivi (MAX zbog GROUPING SETS), a JOIN-ovi su
    // u ugniježđenom fragmentu koji dijeli i upit brojača.
    expect(sqlFragmentText(queries[0].values)).toContain(
      'LEFT JOIN "OrganizationalUnit" ou',
    );
    expect(sqlFragmentText(queries[0].values)).toContain('LEFT JOIN "Service" sv');
    expect(queries[0].sql).toContain('MAX(ou.name) AS "unitName"');
    expect(queries[0].sql).toContain('MAX(sv.name) AS "serviceName"');

    expect(dashboard.byOrganizationalUnit).toEqual([
      expect.objectContaining({ key: 'ou-gone', label: 'ou-gone' }),
      expect.objectContaining({ key: 'ou-it', label: 'IT Ops' }),
    ]);
    expect(dashboard.byService).toEqual([
      expect.objectContaining({ key: 'svc-vpn', label: 'Pristup mreži' }),
    ]);
    expect(dashboard.byPriority).toEqual([
      expect.objectContaining({ key: 'HIGH', label: 'HIGH' }),
    ]);
  });

  it('ne mijenja brojače ni trend kad se dodaju nazivi', async () => {
    const queries: Query[] = [];
    const dashboard = await loadBottleneckDashboardFromSql(
      fakePrisma(queries, [
        breakdownRows,
        [{ d: '2026-09-02', n: 2, pa: 1, wu: 0, ur: 1, od: 0 }],
      ]),
      ['ou-it'],
      window,
    );

    expect(dashboard.counts).toEqual({
      pendingApproval: 1,
      waitingForUser: 0,
      unrouted: 1,
      overdue: 0,
    });
    expect(dashboard.trend).toHaveLength(3);
    expect(dashboard.trend[1]).toMatchObject({ date: '2026-09-02', createdCount: 2 });
    // Id-evi idu parametarski, ne kroz tekst upita.
    expect(JSON.stringify(queries[0].values)).toContain('"ou-it"');
  });

  it('uses the shared predicate for fallback-routed PENDING tickets', async () => {
    const queries: Query[] = [];
    const rows = [{ ...breakdownRows[0], ur: 2 }, ...breakdownRows.slice(1)];
    const dashboard = await loadBottleneckDashboardFromSql(
      fakePrisma(queries, [rows, []]),
      ['ou-it'],
      window,
    );

    expect(dashboard.counts.unrouted).toBe(2);
    expect(sqlFragmentText(queries[0].values)).toContain(
      't."routedByUnroutedFallback" = true',
    );
  });
});
