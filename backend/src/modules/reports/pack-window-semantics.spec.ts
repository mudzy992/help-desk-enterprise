import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  reportPackKeyList,
  reportPackKeys,
  reportPackSlugs,
  type ReportPackKey,
} from './reports.constants';
import {
  reportPackWindow,
  reportPackWindowSemantics,
  reportWindowBoundaries,
} from './pack-window-semantics';
import { isTimestampInWindow, resolveReportWindow } from './resolve-report-window';

const reportsDir = join(__dirname);

function readSource(relativePath: string): string {
  return readFileSync(join(reportsDir, relativePath), 'utf8');
}

describe('report pack window catalog (W7.102 / BA-reports-12)', () => {
  it('has exactly one entry per pack, no more and no less', () => {
    expect(Object.keys(reportPackWindowSemantics).sort()).toEqual(
      [...reportPackKeyList].sort(),
    );
    for (const pack of reportPackKeyList) {
      expect(reportPackWindow(pack)).toBeDefined();
      expect(reportPackSlugs[pack].length).toBeGreaterThan(0);
    }
  });

  it('declares the same half-open period for every pack', () => {
    expect(reportWindowBoundaries).toBe('[from, to)');
    for (const pack of reportPackKeyList) {
      expect(reportPackWindow(pack).boundaries).toBe(reportWindowBoundaries);
    }
  });

  it('keeps each entry consistent with its mode', () => {
    for (const pack of reportPackKeyList) {
      const semantics = reportPackWindow(pack);
      if (semantics.mode === 'snapshot-time') {
        // A snapshot pack reads no event timestamp at all — the period cannot select its rows.
        expect([pack, semantics.eventTime]).toEqual([pack, []]);
        expect([pack, semantics.selection]).toEqual([pack, 'none']);
        expect(semantics.snapshotParts.length).toBeGreaterThan(0);
      } else if (semantics.mode === 'event-time') {
        expect(semantics.eventTime.length).toBeGreaterThan(0);
        expect([pack, semantics.snapshotParts]).toEqual([pack, []]);
        expect(semantics.selection).not.toBe('none');
      } else {
        expect(semantics.eventTime.length).toBeGreaterThan(0);
        expect(semantics.snapshotParts.length).toBeGreaterThan(0);
      }
    }
  });

  it('names the overlap pack and only the overlap pack', () => {
    const overlapping = reportPackKeyList.filter(
      (pack) => reportPackWindow(pack).selection === 'overlap',
    );
    expect(overlapping).toEqual([reportPackKeys.changeSchedule]);
    expect(reportPackWindow(reportPackKeys.changeSchedule).eventTime).toEqual([
      'change.plannedStart',
      'change.plannedEnd',
    ]);
  });

  it('keeps the snapshot packs recognisable to the caller', () => {
    const snapshots = reportPackKeyList.filter(
      (pack: ReportPackKey) => reportPackWindow(pack).mode === 'snapshot-time',
    );
    expect(snapshots).toEqual([
      reportPackKeys.overdueByService,
      reportPackKeys.assetInventory,
      reportPackKeys.assetExpiring,
      reportPackKeys.assetLicenseCompliance,
      reportPackKeys.assetInactiveHolders,
      reportPackKeys.problemBacklog,
    ]);
  });
});

describe('report window boundaries (W7.102 / BA-reports-12)', () => {
  const window = {
    from: new Date('2026-09-01T00:00:00.000Z'),
    to: new Date('2026-10-01T00:00:00.000Z'),
  };

  it('counts `from` and rejects `to`', () => {
    expect(isTimestampInWindow(window.from, window)).toBe(true);
    expect(isTimestampInWindow(new Date('2026-09-30T23:59:59.999Z'), window)).toBe(true);
    // The instant on the upper bound belongs to the next period, never to both.
    expect(isTimestampInWindow(window.to, window)).toBe(false);
    expect(isTimestampInWindow(new Date('2026-10-01T00:00:00.001Z'), window)).toBe(false);
    expect(isTimestampInWindow(new Date('2026-08-31T23:59:59.999Z'), window)).toBe(false);
  });

  it('partitions the timeline: every instant is in exactly one of two adjacent periods', () => {
    const next = { from: window.to, to: new Date('2026-11-01T00:00:00.000Z') };
    const instants = [
      window.from,
      new Date('2026-09-15T10:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
      new Date('2026-10-20T08:30:00.000Z'),
    ];
    for (const instant of instants) {
      const inFirst = isTimestampInWindow(instant, window);
      const inSecond = isTimestampInWindow(instant, next);
      expect([instant.toISOString(), inFirst !== inSecond]).toEqual([
        instant.toISOString(),
        true,
      ]);
    }
  });

  it('resolves explicit windows to the same half-open span', () => {
    const resolved = resolveReportWindow({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-10-01T00:00:00.000Z',
      now: new Date('2026-09-15T12:00:00.000Z'),
      defaultWindowDays: 30,
      mode: 'month',
    });
    expect(resolved).toEqual(window);
    expect(isTimestampInWindow(resolved.to, resolved)).toBe(false);
  });
});

describe('report loaders keep the catalog contract (W7.102 / BA-reports-12)', () => {
  // Anti-drift guard: the catalog is worth nothing if a loader quietly goes back to `lte` on the upper bound
  // or compares against `to` with `<=`. Every window upper bound in the module is exclusive.
  const windowedSources = [
    'resolve-report-window.ts',
    'load-scoped-report-tickets.ts',
    'load-forward-ping-pong-tickets.ts',
    'load-time-tracking-entries.ts',
    'load-report-pack-build-input.ts',
    'packs/load-problem-report-data.ts',
    'packs/load-change-report-data.ts',
    'packs/load-asset-report-data.ts',
    'packs/build-kb-helpfulness-report.ts',
    'packs/build-monthly-kpi-report.ts',
    'dashboard/build-reports-dashboard.ts',
    'dashboard/aggregate-report-dashboard-charts.ts',
    'dashboard/aggregate-report-dashboard-kpis.ts',
    'bottleneck/aggregate-bottleneck-dashboard.ts',
    'trends/assemble-report-trends.ts',
  ];

  it.each(windowedSources)('%s never uses an inclusive upper bound', (file) => {
    const source = readSource(file);
    expect(source).not.toMatch(/lte:\s*[^,\n]*\bwindow\.to\b/);
    expect(source).not.toMatch(/time\s*<=\s*window\.to\.getTime\(\)/);
  });

  it('keeps every window lower bound inclusive, except the one overlap predicate', () => {
    const overlapSources: string[] = [];
    for (const file of windowedSources) {
      const source = readSource(file);
      if (/\bgt:\s*[^,\n]*\bwindow\.from\b/.test(source)) overlapSources.push(file);
    }
    // A change planned to end exactly at `from` does not intersect the period; only the overlap pack may say so.
    expect(overlapSources).toEqual(['packs/load-change-report-data.ts']);
    expect(reportPackWindow(reportPackKeys.changeSchedule).selection).toBe('overlap');
  });

  it('lets only snapshot packs read `now` instead of the period', () => {
    // `now` is legitimate: the window is resolved from it, and snapshot parts are measured at it. What must not
    // happen is a pack that claims event-time and silently prints the present state — hence the catalog entries
    // above list every `now`-based part, and this test pins the loaders that read it.
    const readers = [
      'packs/load-problem-report-data.ts',
      'packs/load-asset-report-data.ts',
    ];
    for (const file of readers) {
      expect(readSource(file)).toMatch(/\bnow\b/);
    }
  });
});
