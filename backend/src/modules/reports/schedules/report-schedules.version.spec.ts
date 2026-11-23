jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import 'reflect-metadata';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../../authentication/authentication.types';
import type { SaveReportScheduleDto } from '../dto/report-schedule.dto';
import { reportErrorCodes } from '../reports.constants';
import type { ReportScheduleRecord } from './report-schedule.record';
import { ReportSchedulesController } from './report-schedules.controller';
import { ReportSchedulesService } from './report-schedules.service';

/**
 * W7.95 (`BA-reports-05`): every admin write of a schedule carried no precondition, so two administrators editing
 * the same row were last-write-wins — the second save silently reverted the first one's name, recipients or OU.
 * The mutations now match on `version` (taken from the row the editor loaded, sent as `If-Match: "vN"`), and a
 * stale token writes **nothing at all**.
 */
const actor = {
  principal: { subjectId: 'admin-1', email: 'admin@example.com', displayName: 'Admin' } as AuthorizationPrincipal,
  requestId: null,
};

function input(overrides: Partial<SaveReportScheduleDto> = {}): SaveReportScheduleDto {
  return {
    name: 'Weekly IT',
    frequency: 'WEEKLY',
    sendTime: '07:00',
    organizationalUnitId: 'ou-it',
    sections: ['kpi'],
    packKeys: [],
    recipientUserIds: ['u-1'],
    ...overrides,
  } as SaveReportScheduleDto;
}

function record(overrides: Partial<ReportScheduleRecord> = {}): ReportScheduleRecord {
  return {
    id: 'sch-1',
    name: 'Weekly IT',
    frequency: 'WEEKLY',
    sendTime: '07:00',
    organizationalUnitId: 'ou-it',
    serviceId: null,
    groupId: null,
    priority: null,
    sections: ['kpi'],
    packKeys: [],
    enabled: true,
    version: 5,
    nextRunAt: new Date('2026-05-04T05:00:00.000Z'),
    lastRunAt: null,
    createdByUserId: 'admin-1',
    updatedByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdBy: { id: 'admin-1', displayName: 'Admin' },
    organizationalUnit: { id: 'ou-it', name: 'IT' },
    service: null,
    group: null,
    recipients: [
      { userId: 'u-1', user: { id: 'u-1', displayName: 'User', email: 'u1@example.com', isActive: true } },
    ],
    ...overrides,
  } as ReportScheduleRecord;
}

function createHarness(options: { readonly row: ReportScheduleRecord | null; readonly winner?: boolean }) {
  const calls: { readonly method: string; readonly args?: unknown }[] = [];
  const track = (method: string, args?: unknown) => calls.push({ method, args });
  const prisma = {
    $executeRaw: async () => 0,
    $queryRaw: async () => [{ acquired: 1 }],
    $transaction: async (callback: unknown) =>
      typeof callback === 'function'
        ? (callback as (transaction: unknown) => Promise<unknown>)(prisma)
        : Promise.all(callback as Promise<unknown>[]),
    auditLog: { findFirst: async () => null, create: async () => ({}) },
    organizationalUnit: {
      findUnique: async () => ({ id: 'ou-it', ouPath: '/Korisnici/IT' }),
      findMany: async () => [{ id: 'ou-it', ouPath: '/Korisnici/IT' }],
    },
    service: { findUnique: async () => null },
    group: { findUnique: async () => null, findMany: async () => [] },
    reportSchedule: {
      findUnique: async (args: { where: { id: string }; select?: Record<string, unknown> }) => {
        track('reportSchedule.findUnique', args);
        if (args.select !== undefined && Object.keys(args.select).length === 1) {
          // The classification reread used after a lost CAS: the row is still there, at its current version.
          return options.row === null ? null : { version: options.row.version };
        }
        return options.row;
      },
      updateMany: async (args: unknown) => {
        track('reportSchedule.updateMany', args);
        return { count: options.winner === false ? 0 : 1 };
      },
      deleteMany: async (args: unknown) => {
        track('reportSchedule.deleteMany', args);
        return { count: options.winner === false ? 0 : 1 };
      },
    },
    reportScheduleRecipient: {
      deleteMany: async (args: unknown) => {
        track('reportScheduleRecipient.deleteMany', args);
        return { count: 0 };
      },
      createMany: async (args: unknown) => {
        track('reportScheduleRecipient.createMany', args);
        return { count: 0 };
      },
    },
    reportScheduleRun: { findMany: async () => [] },
  };
  const service = new ReportSchedulesService(
    prisma as never,
    {
      load: async () => ({
        enabled: true,
        maxSchedules: 50,
        maxRecipients: 25,
        attachmentMaxRows: 10_000,
        defaultSendTime: '07:00',
        timeZone: 'Europe/Sarajevo',
      }),
    } as never,
    {
      load: async () => ({
        reportsEnabled: true,
        addonEnabled: true,
        enabledPacks: [],
        allowedFormats: ['csv'],
        bottlenecksEnabled: true,
        defaultWindowDays: 30,
        packWindowDays: 30,
        csatScaleMax: 5,
        pingPongThreshold: 3,
      }),
    } as never,
    {
      canAccess: async () => true,
      canUseScheduleService: async () => true,
      evaluate: async (ids: readonly string[]) =>
        ids.map((id) => ({
          ok: true,
          user: {
            id,
            email: `${id}@example.com`,
            displayName: id,
            preferredLocale: 'bs',
            isLocalOnly: false,
            isActive: true,
          },
        })),
    } as never,
    { run: async () => ({ runId: null, status: 'SENT', sentCount: 0, skipped: [] }) } as never,
  );
  return { service, calls, prisma };
}

describe('report schedule CAS (BA-reports-05)', () => {
  it('refuses a stale save and leaves the recipients alone', async () => {
    const { service, calls } = createHarness({ row: record({ version: 5 }), winner: false });

    await expect(service.update(actor, 'sch-1', input(), 4)).rejects.toMatchObject({
      code: 'OPTIMISTIC_STALE_WRITE',
      httpStatus: 412,
      currentEtag: '"v5"',
    });
    expect(calls.filter((call) => call.method === 'reportScheduleRecipient.deleteMany')).toHaveLength(0);
    expect(calls.filter((call) => call.method === 'reportScheduleRecipient.createMany')).toHaveLength(0);
  });

  it('matches the loaded version and bumps it by one', async () => {
    const { service, calls } = createHarness({ row: record({ version: 5 }) });

    await service.update(actor, 'sch-1', input({ name: 'Renamed' }), 5);

    const mutation = calls.find((call) => call.method === 'reportSchedule.updateMany')?.args as {
      where: unknown;
      data: Record<string, unknown>;
    };
    expect(mutation.where).toEqual({ id: 'sch-1', version: 5 });
    expect(mutation.data).toMatchObject({ name: 'Renamed', version: 6 });
    expect(calls.filter((call) => call.method === 'reportScheduleRecipient.createMany')).toHaveLength(1);
  });

  it('never runs an unconditional write when the token is missing', async () => {
    const { service, calls } = createHarness({ row: record() });

    // Prisma drops `undefined` from a `where`, which would silently turn the CAS back into a blind write.
    await expect(service.update(actor, 'sch-1', input(), undefined as never)).rejects.toMatchObject({
      code: 'OPTIMISTIC_IF_MATCH_INVALID',
      httpStatus: 400,
    });
    expect(calls.filter((call) => call.method === 'reportSchedule.updateMany')).toHaveLength(0);
  });

  it('refuses a stale enable toggle even when it would change nothing', async () => {
    const { service, calls } = createHarness({ row: record({ version: 5, enabled: true }) });

    await expect(service.setEnabled(actor, 'sch-1', true, 4)).rejects.toMatchObject({
      code: 'OPTIMISTIC_STALE_WRITE',
    });
    expect(calls.filter((call) => call.method === 'reportSchedule.updateMany')).toHaveLength(0);
  });

  it('refuses to delete a row that moved on, and deletes the one that did not', async () => {
    const stale = createHarness({ row: record({ version: 5 }), winner: false });
    await expect(stale.service.remove(actor, 'sch-1', 4)).rejects.toMatchObject({
      code: 'OPTIMISTIC_STALE_WRITE',
      currentEtag: '"v5"',
    });

    const fresh = createHarness({ row: record({ version: 5 }) });
    await expect(fresh.service.remove(actor, 'sch-1', 5)).resolves.toBeUndefined();
    expect(fresh.calls.find((call) => call.method === 'reportSchedule.deleteMany')?.args).toEqual({
      where: { id: 'sch-1', version: 5 },
    });
  });

  it('answers a vanished row with the module 404, not with a stale-write 412', async () => {
    const { service } = createHarness({ row: null, winner: false });
    await expect(service.remove(actor, 'sch-1', 5)).rejects.toMatchObject({
      code: reportErrorCodes.scheduleNotFound,
    });
  });
});

describe('reports schedule routes require the precondition (BA-reports-05)', () => {
  function controllerHarness() {
    const received: unknown[] = [];
    const controller = new ReportSchedulesController({
      update: async (...args: unknown[]) => {
        received.push(args);
        return {};
      },
      setEnabled: async (...args: unknown[]) => {
        received.push(args);
        return {};
      },
      remove: async (...args: unknown[]) => {
        received.push(args);
      },
    } as never);
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: actor.principal,
    } as never;
    return { controller, request, received };
  }

  it('answers 428 when If-Match is missing and 400 when it is malformed', async () => {
    const { controller, request, received } = controllerHarness();

    await expect(controller.update('sch-1', input(), request, undefined)).rejects.toMatchObject({
      code: 'OPTIMISTIC_PRECONDITION_REQUIRED',
      httpStatus: 428,
    });
    await expect(controller.update('sch-1', input(), request, 'W/"v2"')).rejects.toMatchObject({
      code: 'OPTIMISTIC_IF_MATCH_INVALID',
      httpStatus: 400,
    });
    await expect(controller.remove('sch-1', request, undefined)).rejects.toMatchObject({
      status: 428,
    });
    expect(received).toHaveLength(0);
  });

  it('passes the parsed version down as a number', async () => {
    const { controller, request, received } = controllerHarness();

    await controller.update('sch-1', input(), request, '"v7"');
    await controller.setEnabled('sch-1', { enabled: false } as never, request, '"v7"');
    await controller.remove('sch-1', request, '"v7"');

    expect(received.map((args) => (args as unknown[])[3] ?? (args as unknown[])[2])).toEqual([7, 7, 7]);
  });
});
