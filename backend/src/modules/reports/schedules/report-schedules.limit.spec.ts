jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import 'reflect-metadata';
import type { AuthorizationPrincipal } from '../../authentication/authentication.types';
import type { SaveReportScheduleDto } from '../dto/report-schedule.dto';
import { reportErrorCodes } from '../reports.constants';
import { ReportsError } from '../reports.error';
import { ReportSchedulesService } from './report-schedules.service';

/**
 * W7.94 (`BA-reports-04`): `maxSchedules` was a `count()` and then a `create()` with nothing in between, so two
 * saves that ran together both passed the check. The service now counts *inside* the locked transaction; these
 * tests pin the ordering (lock → count → create), the clean refusal at the limit, and that a refusal writes
 * nothing. The real race is proven against PostgreSQL in `report-schedule-limit.integration.spec.ts`.
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

function createHarness(options: { readonly total: number; readonly maxSchedules: number }) {
  const calls: string[] = [];
  const created: unknown[] = [];
  const prisma = {
    $executeRaw: async () => 0,
    $queryRaw: async () => {
      calls.push('lock');
      return [{ acquired: 1 }];
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(prisma),
    auditLog: { findFirst: async () => null, create: async () => ({}) },
    organizationalUnit: {
      findUnique: async () => ({ id: 'ou-it', ouPath: '/Korisnici/IT' }),
      findMany: async () => [{ id: 'ou-it', ouPath: '/Korisnici/IT' }],
    },
    service: { findUnique: async () => null },
    group: { findUnique: async () => null, findMany: async () => [] },
    reportSchedule: {
      count: async () => {
        calls.push('count');
        return options.total;
      },
      create: async (args: unknown) => {
        calls.push('create');
        created.push(args);
        return { id: 'sch-1' };
      },
      findUnique: async () =>
        created.length === 0
          ? null
          : {
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
              nextRunAt: new Date('2026-05-04T05:00:00Z'),
              lastRunAt: null,
              createdByUserId: 'admin-1',
              updatedByUserId: null,
              createdAt: new Date('2026-01-01T00:00:00Z'),
              updatedAt: new Date('2026-01-01T00:00:00Z'),
              createdBy: { id: 'admin-1', displayName: 'Admin' },
              organizationalUnit: { id: 'ou-it', name: 'IT' },
              service: null,
              group: null,
              recipients: [
                {
                  userId: 'u-1',
                  user: { id: 'u-1', displayName: 'User', email: 'u1@example.com', isActive: true },
                },
              ],
            },
    },
    reportScheduleRun: { findMany: async () => [] },
  };
  const service = new ReportSchedulesService(
    prisma as never,
    {
      load: async () => ({
        enabled: true,
        maxSchedules: options.maxSchedules,
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
          user: { id, email: `${id}@example.com`, displayName: id, preferredLocale: 'bs', isLocalOnly: false, isActive: true },
        })),
    } as never,
    { run: async () => ({ runId: null, status: 'SENT', sentCount: 0, skipped: [] }) } as never,
  );
  return { service, calls, created };
}

describe('report schedule limit (BA-reports-04)', () => {
  it('refuses the create once the limit is reached, without writing anything', async () => {
    const { service, created } = createHarness({ total: 50, maxSchedules: 50 });

    await expect(service.create(actor, input())).rejects.toMatchObject({
      code: reportErrorCodes.scheduleLimit,
      details: { max: 50 },
    });
    expect(created).toHaveLength(0);
  });

  it('takes the lock before it counts, and counts before it creates', async () => {
    const { service, calls, created } = createHarness({ total: 49, maxSchedules: 50 });

    await expect(service.create(actor, input())).resolves.toBeDefined();
    // The lock primitive issues two statements (`set_config`, then the advisory lock) before the count.
    expect(calls.filter((call) => call === 'lock').length).toBeGreaterThanOrEqual(1);
    expect(calls.lastIndexOf('lock')).toBeLessThan(calls.indexOf('count'));
    expect(calls.indexOf('count')).toBeLessThan(calls.indexOf('create'));
    expect(created).toHaveLength(1);
  });

  it('fails closed with the operational code when the limit lock stays busy', async () => {
    const { service, created } = createHarness({ total: 0, maxSchedules: 50 });
    // The advisory lock times out: `set_config`/`pg_advisory_xact_lock` raise 55P03.
    (service as unknown as { prisma: { $queryRaw: () => Promise<unknown> } }).prisma.$queryRaw = async () => {
      throw Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' });
    };

    await expect(service.create(actor, input())).rejects.toMatchObject({
      code: reportErrorCodes.scheduleLimitUnavailable,
    });
    expect(created).toHaveLength(0);
  });

  it('counts a raw refusal as a ReportsError, not as a generic failure', async () => {
    const { service } = createHarness({ total: 1, maxSchedules: 1 });
    await expect(service.create(actor, input())).rejects.toBeInstanceOf(ReportsError);
  });
});
