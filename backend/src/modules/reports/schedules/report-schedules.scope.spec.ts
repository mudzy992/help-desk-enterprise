jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import 'reflect-metadata';
import type { AuthorizationPrincipal } from '../../authentication/authentication.types';
import type { SaveReportScheduleDto } from '../dto/report-schedule.dto';
import { reportErrorCodes } from '../reports.constants';
import { ReportsError } from '../reports.error';
import { ReportSchedulesService } from './report-schedules.service';
import type { ReportScheduleRecord } from './report-schedule.record';

/**
 * W7.93 (`BA-reports-03`): saving a schedule used to check *existence* only. A group from a parent or a
 * sibling unit, or a service the actor may not use, was stored as if it were a valid filter — the schedule
 * then produced an empty slice and its view/e-mail scope line named a resource outside the unit.
 *
 * These tests pin the contract of the write path (refuse, and answer unknown ids exactly like foreign ones
 * so the API cannot be used to probe which ids exist) and of the read path (a row saved before this package
 * must not keep printing a name it should not have).
 */
const actor = {
  principal: {
    subjectId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Admin',
  } as AuthorizationPrincipal,
  requestId: null,
};

const itPath = '/Korisnici/IT';
const hrPath = '/Korisnici/HR';

function scheduleRecord(overrides: Partial<ReportScheduleRecord> = {}): ReportScheduleRecord {
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
    version: 1,
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
    ...overrides,
  };
}

function createHarness(options: {
  readonly group?: { readonly id: string; readonly ouPath: string } | null;
  readonly service?: { readonly id: string } | null;
  readonly serviceAllowed?: boolean;
  readonly record?: ReportScheduleRecord | null;
}) {
  const created: unknown[] = [];
  const units = [
    { id: 'ou-it', ouPath: itPath },
    { id: 'ou-hr', ouPath: hrPath },
    { id: 'ou-sd', ouPath: `${itPath}/ServiceDesk` },
  ];
  const prisma = {
    $executeRaw: async () => 0,
    // W7.94: the schedule limit is consumed inside a locked transaction; the fake answers both lock statements.
    $queryRaw: async () => [{ acquired: 1 }],
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(prisma),
    auditLog: { findFirst: async () => null, create: async () => ({}) },
    organizationalUnit: {
      findUnique: async (args: { readonly where: { readonly id: string } }) => {
        const unit = units.find((entry) => entry.id === args.where.id);
        return unit ?? null;
      },
      findMany: async () => units,
    },
    service: {
      findUnique: async (args: { readonly where: { readonly id: string } }) =>
        options.service !== null &&
        options.service !== undefined &&
        options.service.id === args.where.id
          ? { id: options.service.id }
          : null,
    },
    group: {
      findUnique: async (args: { readonly where: { readonly id: string } }) =>
        options.group !== null && options.group !== undefined && options.group.id === args.where.id
          ? { id: options.group.id, organizationalUnit: { ouPath: options.group.ouPath } }
          : null,
      findMany: async () =>
        options.group !== null && options.group !== undefined
          ? [
              {
                id: options.group.id,
                organizationalUnitId:
                  units.find((unit) => unit.ouPath === options.group?.ouPath)?.id ?? 'ou-missing',
              },
            ]
          : [],
    },
    reportSchedule: {
      count: async () => 0,
      create: async (args: unknown) => {
        created.push(args);
        return { id: 'sch-1' };
      },
      findUnique: async () =>
        options.record !== undefined && options.record !== null
          ? options.record
          : created.length > 0
            ? scheduleRecord()
            : null,
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
      canUseScheduleService: async () => options.serviceAllowed ?? true,
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
  return { service, created, prisma };
}

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

async function rejection(promise: Promise<unknown>): Promise<{ code: string; details: unknown }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ReportsError) return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error('expected the schedule save to be refused');
}

describe('report schedule reference scope (BA-reports-03)', () => {
  it('refuses a group that lives outside the selected unit subtree and stores nothing', async () => {
    const { service, created } = createHarness({ group: { id: 'g-hr', ouPath: hrPath } });
    const refused = await rejection(service.create(actor, input({ groupId: 'g-hr' })));

    expect(refused.code).toBe(reportErrorCodes.scheduleScopeInvalid);
    expect(refused.details).toEqual({ field: 'groupId' });
    expect(created).toHaveLength(0);
  });

  it('answers an unknown group exactly like a foreign one, so the API is not an existence oracle', async () => {
    const foreign = await rejection(
      createHarness({ group: { id: 'g-hr', ouPath: hrPath } }).service.create(
        actor,
        input({ groupId: 'g-hr' }),
      ),
    );
    const unknown = await rejection(
      createHarness({ group: null }).service.create(actor, input({ groupId: 'g-none' })),
    );

    expect(unknown).toEqual(foreign);
  });

  it('accepts a group of the selected unit and of its descendants', async () => {
    for (const ouPath of [itPath, `${itPath}/ServiceDesk`]) {
      const { service, created } = createHarness({ group: { id: 'g-it', ouPath } });
      await service.create(actor, input({ groupId: 'g-it', recipientUserIds: ['u-1'] }));
      expect(created).toHaveLength(1);
    }
  });

  it('refuses a service the actor may not use, even though the service exists', async () => {
    const { service, created } = createHarness({
      service: { id: 'svc-vpn' },
      serviceAllowed: false,
    });
    const refused = await rejection(service.create(actor, input({ serviceId: 'svc-vpn' })));

    expect(refused.code).toBe(reportErrorCodes.scheduleScopeInvalid);
    expect(refused.details).toEqual({ field: 'serviceId' });
    expect(created).toHaveLength(0);
  });

  it('answers an unknown service exactly like one outside the actor service scope', async () => {
    const outside = await rejection(
      createHarness({ service: { id: 'svc-vpn' }, serviceAllowed: false }).service.create(
        actor,
        input({ serviceId: 'svc-vpn' }),
      ),
    );
    const unknown = await rejection(
      createHarness({ service: null }).service.create(actor, input({ serviceId: 'svc-none' })),
    );

    expect(unknown).toEqual(outside);
  });

  it('accepts a service the actor covers', async () => {
    const { service, created } = createHarness({
      service: { id: 'svc-vpn' },
      serviceAllowed: true,
    });
    await service.create(actor, input({ serviceId: 'svc-vpn' }));
    expect(created).toHaveLength(1);
  });

  it('hides the group name of a legacy row whose group sits outside the unit', async () => {
    const { service } = createHarness({
      group: { id: 'g-hr', ouPath: hrPath },
      record: scheduleRecord({ groupId: 'g-hr', group: { id: 'g-hr', name: 'HR grupa' } }),
    });
    const view = await service.get(actor, 'sch-1');

    expect(view.group).toBeNull();
    expect(JSON.stringify(view)).not.toContain('HR grupa');
  });

  it('keeps the group name of a legacy row that does belong to the unit', async () => {
    const { service } = createHarness({
      group: { id: 'g-it', ouPath: `${itPath}/ServiceDesk` },
      record: scheduleRecord({ groupId: 'g-it', group: { id: 'g-it', name: 'ServiceDesk tim' } }),
    });
    const view = await service.get(actor, 'sch-1');

    expect(view.group).toEqual({ id: 'g-it', name: 'ServiceDesk tim' });
  });

  it('hides the service name of a legacy row the reader cannot use', async () => {
    const { service } = createHarness({
      service: { id: 'svc-vpn' },
      serviceAllowed: false,
      record: scheduleRecord({ serviceId: 'svc-vpn', service: { id: 'svc-vpn', name: 'VPN' } }),
    });
    const view = await service.get(actor, 'sch-1');

    expect(view.service).toBeNull();
    expect(JSON.stringify(view)).not.toContain('VPN');
  });

  it('keeps the service name when the reader covers the service', async () => {
    const { service } = createHarness({
      service: { id: 'svc-vpn' },
      serviceAllowed: true,
      record: scheduleRecord({ serviceId: 'svc-vpn', service: { id: 'svc-vpn', name: 'VPN' } }),
    });
    const view = await service.get(actor, 'sch-1');

    expect(view.service).toEqual({ id: 'svc-vpn', name: 'VPN' });
  });
});
