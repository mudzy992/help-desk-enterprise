jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import 'reflect-metadata';
import type { AuthorizationPrincipal } from '../../authentication/authentication.types';
import type { SaveReportScheduleDto } from '../dto/report-schedule.dto';
import type { ReportScheduleRecord } from './report-schedule.record';
import { ReportSchedulesService } from './report-schedules.service';

/**
 * W7.96 (`BA-reports-06`): every schedule mutation used to commit first and *then* append its global audit row.
 * A failing audit insert answered the administrator with an error although the change was already visible, and a
 * crash in between left a change (or a deletion) nobody could account for. The audit row is now appended by the
 * mutation's own transaction, so the two are one unit: either both are visible or neither is.
 *
 * These tests pin the *membership* of the writes in a transaction and the failure behaviour. The rollback itself is
 * proven against PostgreSQL in `report-schedule-audit-atomicity.integration.spec.ts`.
 */
const actor = {
  principal: { subjectId: 'admin-1', email: 'admin@example.com', displayName: 'Admin' } as AuthorizationPrincipal,
  requestId: 'req-1',
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

function createHarness(options: { readonly auditFails?: boolean } = {}) {
  /** `'write:tx'` / `'audit:tx'` — anything ending in `outside` escaped the transaction. */
  const events: string[] = [];
  let inTransaction = false;
  let rolledBack = false;
  const failAudit = options.auditFails === true;
  const prisma = {
    $executeRaw: async () => 0,
    $queryRaw: async () => [{ acquired: 1 }],
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
      inTransaction = true;
      try {
        return await callback(prisma);
      } catch (error) {
        // A real Prisma transaction discards every write of the callback when it throws.
        rolledBack = true;
        throw error;
      } finally {
        inTransaction = false;
      }
    },
    auditLog: {
      findFirst: async () => null,
      create: async () => {
        events.push(`audit:${inTransaction ? 'tx' : 'outside'}`);
        if (failAudit) throw new Error('audit chain unavailable');
        return {};
      },
    },
    organizationalUnit: {
      findUnique: async () => ({ id: 'ou-it', ouPath: '/Korisnici/IT' }),
      findMany: async () => [{ id: 'ou-it', ouPath: '/Korisnici/IT' }],
    },
    service: { findUnique: async () => null },
    group: { findUnique: async () => null, findMany: async () => [] },
    reportSchedule: {
      count: async () => 0,
      create: async () => {
        events.push(`write:${inTransaction ? 'tx' : 'outside'}`);
        return { id: 'sch-1' };
      },
      updateMany: async () => {
        events.push(`write:${inTransaction ? 'tx' : 'outside'}`);
        return { count: 1 };
      },
      deleteMany: async () => {
        events.push(`write:${inTransaction ? 'tx' : 'outside'}`);
        return { count: 1 };
      },
      findUnique: async (args: { where: { id: string }; select?: Record<string, unknown> }) =>
        args.select !== undefined && Object.keys(args.select).length === 1 ? { version: 5 } : record(),
    },
    reportScheduleRecipient: {
      deleteMany: async () => {
        events.push(`recipients:${inTransaction ? 'tx' : 'outside'}`);
        return { count: 0 };
      },
      createMany: async () => {
        events.push(`recipients:${inTransaction ? 'tx' : 'outside'}`);
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
  return {
    service,
    events,
    rolledBack: () => rolledBack,
  };
}

describe('schedule mutation and its audit row share one transaction (BA-reports-06)', () => {
  it('creates the schedule and appends the audit row inside the same transaction', async () => {
    const { service, events } = createHarness();

    await service.create(actor, input());

    expect(events).toEqual(['write:tx', 'audit:tx']);
  });

  it('updates the schedule, its recipients and the audit row inside the same transaction', async () => {
    const { service, events } = createHarness();

    await service.update(actor, 'sch-1', input({ name: 'Renamed' }), 5);

    expect(events).toEqual(['write:tx', 'recipients:tx', 'recipients:tx', 'audit:tx']);
  });

  it('toggles the switch and appends the audit row inside the same transaction', async () => {
    const { service, events } = createHarness();

    await service.setEnabled(actor, 'sch-1', false, 5);

    expect(events).toEqual(['write:tx', 'audit:tx']);
  });

  it('deletes the schedule and appends the audit row inside the same transaction', async () => {
    const { service, events } = createHarness();

    await service.remove(actor, 'sch-1', 5);

    expect(events).toEqual(['write:tx', 'audit:tx']);
  });

  it('fails the whole create when the audit row cannot be written', async () => {
    const { service, rolledBack } = createHarness({ auditFails: true });

    // The caller learns that nothing was created, because nothing was.
    await expect(service.create(actor, input())).rejects.toThrow('audit chain unavailable');
    expect(rolledBack()).toBe(true);
  });

  it('fails the whole delete when the audit row cannot be written', async () => {
    const { service, rolledBack } = createHarness({ auditFails: true });

    await expect(service.remove(actor, 'sch-1', 5)).rejects.toThrow('audit chain unavailable');
    expect(rolledBack()).toBe(true);
  });
});
