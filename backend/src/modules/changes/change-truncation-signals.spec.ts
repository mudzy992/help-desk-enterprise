import { changeConflictSnapshot } from './change-conflict-snapshot';
import { detectChangeConflicts, hasWarnings, type ChangeConflicts } from './change-conflicts';
import { changeLimits } from './changes.constants';
import { ChangeScheduleService } from './change-schedule.service';

type QueryArgs = Record<string, unknown>;

const viewer = { userId: 'user-1', isSuperAdmin: false, homeOrganizationalUnitId: null, grants: [] };
const scope = { all: true as const };
const windowStart = new Date('2030-05-01T10:00:00.000Z');
const windowEnd = new Date('2030-05-01T12:00:00.000Z');

function configuration() {
  return {
    numberPrefix: 'CHG',
    normalQuorum: 1,
    emergencyQuorum: 1,
    minLeadTimeHours: 0,
    requireTestPlan: false,
    freezePeriods: [],
    reminderHoursBeforeStart: 24,
    timeZone: 'UTC',
  };
}

function calendarRow(id: string) {
  return {
    id,
    sequence: 1,
    title: `Promjena ${id}`,
    type: 'NORMAL' as const,
    status: 'SCHEDULED' as const,
    risk: 'MEDIUM' as const,
    plannedStart: windowStart,
    plannedEnd: windowEnd,
    causesDowntime: false,
    services: [],
  };
}

/** The database row the scan reads (`plannedStart`/`plannedEnd` + link tables). */
function conflictRow(id: string) {
  return {
    id,
    sequence: 1,
    title: `Promjena ${id}`,
    status: 'SCHEDULED' as const,
    plannedStart: windowStart,
    plannedEnd: windowEnd,
    services: [{ serviceId: 'service-1' }],
    assets: [],
  };
}

/** The already-mapped candidate `detectChangeConflicts` takes. */
function conflictCandidate(id: string) {
  return {
    id,
    sequence: 1,
    title: `Promjena ${id}`,
    status: 'SCHEDULED' as const,
    start: windowStart,
    end: windowEnd,
    serviceIds: ['service-1'],
    assetIds: [],
  };
}

function buildSchedule(rows: { changes?: readonly unknown[]; downtime?: readonly unknown[]; candidates?: readonly unknown[] }) {
  const prisma = {
    changeRequest: {
      findMany: jest.fn(async (args: QueryArgs): Promise<readonly unknown[]> => {
        const select = args.select as QueryArgs | undefined;
        // The calendar query is the only one that selects the risk badge.
        if (select !== undefined && select.risk !== undefined) return rows.changes ?? [];
        return rows.candidates ?? [];
      }),
      count: jest.fn(async (): Promise<number> => 0),
    },
    serviceDowntimeWindow: {
      findMany: jest.fn(async (_args: QueryArgs): Promise<readonly unknown[]> => rows.downtime ?? []),
      count: jest.fn(async (): Promise<number> => 0),
    },
    service: { findMany: jest.fn(async (_args: QueryArgs): Promise<readonly unknown[]> => []) },
  };
  const access = {
    require: jest.fn(async () => scope),
    configuration: jest.fn(async () => configuration()),
  };
  return { prisma, access, service: new ChangeScheduleService(prisma as never, access as never) };
}

describe('change truncation signals (BA-changes-18)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports a conflict scan that hit its cap instead of looking complete', async () => {
    const candidates = Array.from({ length: changeLimits.conflictCandidatesMax + 1 }, (_, index) =>
      conflictRow(`change-${index}`),
    );
    const { prisma, service } = buildSchedule({ candidates });

    const conflicts = await service.conflictsFor(
      { changeId: 'change-in', type: 'NORMAL', window: { start: windowStart, end: windowEnd }, serviceIds: ['service-1'], assetIds: [] },
      configuration(),
    );

    expect((prisma.changeRequest.findMany.mock.calls[0][0] as QueryArgs).take).toBe(changeLimits.conflictCandidatesMax + 1);
    expect(conflicts.changes).toHaveLength(changeLimits.conflictCandidatesMax);
    expect(conflicts.truncated).toEqual({ changes: true, downtime: false });
    // A cut scan is a warning: the acknowledgement flow must not read as clean.
    expect(hasWarnings(conflicts)).toBe(true);
  });

  it('marks a scan as complete when it read everything', () => {
    const conflicts = detectChangeConflicts({
      changeId: 'change-in',
      type: 'NORMAL',
      window: { start: windowStart, end: windowEnd },
      serviceIds: ['service-1'],
      assetIds: [],
      candidates: [conflictCandidate('change-out')],
      downtime: [],
      freezePeriods: [],
      timeZone: 'UTC',
      truncated: { changes: false, downtime: false },
    });

    expect(conflicts.changes).toHaveLength(1);
    expect(conflicts.truncated).toEqual({ changes: false, downtime: false });
    expect(hasWarnings(conflicts)).toBe(true);
  });

  it('puts truncation into the acknowledgement digest', () => {
    const base = detectChangeConflicts({
      changeId: 'change-in',
      type: 'NORMAL',
      window: { start: windowStart, end: windowEnd },
      serviceIds: ['service-1'],
      assetIds: [],
      candidates: [conflictCandidate('change-out')],
      downtime: [],
      freezePeriods: [],
      timeZone: 'UTC',
    });
    const cut: ChangeConflicts = { ...base, truncated: { changes: true, downtime: true } };

    const complete = changeConflictSnapshot(base, { start: windowStart, end: windowEnd });
    const truncated = changeConflictSnapshot(cut, { start: windowStart, end: windowEnd });

    // A preview taken while the scan was capped cannot be acknowledged as if
    // the reviewer had seen every overlap.
    expect(truncated.hash).not.toBe(complete.hash);
    expect(truncated.truncated).toEqual({ changes: true, downtime: true });
    expect(complete.truncated).toEqual({ changes: false, downtime: false });
    expect(truncated.hasWarnings).toBe(true);
  });

  it('says so in the calendar when a period holds more changes than one page', async () => {
    const changes = Array.from({ length: changeLimits.calendarMaxItems + 1 }, (_, index) => calendarRow(`c-${index}`));
    const { service } = buildSchedule({ changes });

    const calendar = await service.calendar(viewer, '2030-05-01', '2030-05-02');

    expect(calendar.changes).toHaveLength(changeLimits.calendarMaxItems);
    expect(calendar.truncated).toBe(true);
  });

  it('does not claim truncation for a period that is exactly one page', async () => {
    const changes = Array.from({ length: changeLimits.calendarMaxItems }, (_, index) => calendarRow(`c-${index}`));
    const { service } = buildSchedule({ changes });

    const calendar = await service.calendar(viewer, '2030-05-01', '2030-05-02');

    expect(calendar.changes).toHaveLength(changeLimits.calendarMaxItems);
    expect(calendar.truncated).toBe(false);
  });
});
