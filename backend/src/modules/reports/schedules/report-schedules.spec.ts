jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import 'reflect-metadata';
import {
  AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY,
  AUTHORIZATION_REQUIRED_PERMISSIONS_KEY,
  AUTHORIZATION_REQUIRED_ROLES_KEY,
} from '../../authorization/authorization.constants';
import { defaultEmailTemplates } from '../../notifications/email/default-email-templates';
import { ReportsController } from '../reports.controller';
import { composeScheduledReportEmail, trendsLinkQuery } from './compose-scheduled-report-email';
import { reportsAccessRequirements } from './report-access.checker';
import { nextReportRunAt, previousReportPeriod, trendFirstDay } from './report-schedule-calendar';
import { parseReportSchedulesConfiguration } from './report-schedules-configuration.loader';
import { composeScheduledReportPreview } from './scheduled-report-preview';
import { ScheduledReportRunner, slotKeyOf } from './scheduled-report.runner';
import type { ReportScheduleRecord } from './report-schedule.record';

const zone = 'Europe/Sarajevo';

describe('report schedule calendar (design §5.1)', () => {
  it('sends weekly on Monday at the local time, across DST', () => {
    // Friday 27 March 2026 → Monday 30 March, first Monday of summer time.
    expect(nextReportRunAt('WEEKLY', '07:00', zone, new Date('2026-03-27T12:00:00Z')).toISOString()).toBe(
      '2026-03-30T05:00:00.000Z',
    );
    // Winter time again after 25 October.
    expect(nextReportRunAt('WEEKLY', '07:00', zone, new Date('2026-10-24T12:00:00Z')).toISOString()).toBe(
      '2026-10-26T06:00:00.000Z',
    );
  });

  it('is strictly after the reference instant', () => {
    const slot = new Date('2026-03-30T05:00:00.000Z');
    expect(nextReportRunAt('WEEKLY', '07:00', zone, slot).toISOString()).toBe('2026-04-06T05:00:00.000Z');
    expect(nextReportRunAt('WEEKLY', '07:00', zone, new Date(slot.getTime() - 1)).toISOString()).toBe(slot.toISOString());
  });

  it('sends monthly on the 1st, also after a 31-day month and in December', () => {
    expect(nextReportRunAt('MONTHLY', '07:00', zone, new Date('2026-01-31T12:00:00Z')).toISOString()).toBe(
      '2026-02-01T06:00:00.000Z',
    );
    expect(nextReportRunAt('MONTHLY', '23:30', zone, new Date('2026-12-15T12:00:00Z')).toISOString()).toBe(
      '2027-01-01T22:30:00.000Z',
    );
  });

  it('reports the previous complete week or month', () => {
    const week = previousReportPeriod('WEEKLY', zone, new Date('2026-03-30T05:00:00Z'));
    expect([week.start.toISOString(), week.end.toISOString()]).toEqual([
      '2026-03-22T23:00:00.000Z',
      '2026-03-29T22:00:00.000Z',
    ]);
    expect(week.lastDay).toEqual({ year: 2026, month: 3, day: 29 });
    const month = previousReportPeriod('MONTHLY', zone, new Date('2026-03-01T06:00:00Z'));
    expect([month.start.toISOString(), month.end.toISOString()]).toEqual([
      '2026-01-31T23:00:00.000Z',
      '2026-02-28T23:00:00.000Z',
    ]);
    expect(trendFirstDay('MONTHLY', month, 12)).toEqual({ year: 2025, month: 3, day: 1 });
    expect(trendFirstDay('WEEKLY', week, 12)).toEqual({ year: 2026, month: 1, day: 5 });
  });
});

describe('scheduled report settings', () => {
  it('falls back to the defaults on invalid values', () => {
    expect(
      parseReportSchedulesConfiguration({
        enabled: 'yes',
        maxSchedules: 0,
        maxRecipients: 500,
        attachmentMaxRows: 99,
        defaultSendTime: '7:00',
        timeZone: zone,
      }),
    ).toEqual({
      enabled: true,
      maxSchedules: 50,
      maxRecipients: 25,
      attachmentMaxRows: 10_000,
      defaultSendTime: '07:00',
      timeZone: zone,
    });
  });
});

describe('recipient eligibility mirrors the reports page (design §5.2)', () => {
  it('uses exactly the ReportsController requirements', () => {
    expect(Reflect.getMetadata(AUTHORIZATION_REQUIRED_ROLES_KEY, ReportsController)).toEqual(
      reportsAccessRequirements.requiredRoles,
    );
    expect(Reflect.getMetadata(AUTHORIZATION_REQUIRED_PERMISSIONS_KEY, ReportsController)).toEqual(
      reportsAccessRequirements.requiredPermissions,
    );
    expect(Reflect.getMetadata(AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY, ReportsController)).toEqual(
      reportsAccessRequirements.organizationalUnitScope,
    );
  });
});

const channel = {
  deliveryEnabled: true,
  internalOnly: true,
  internalDomains: ['epbih.ba'],
  allowedExternalDomains: [],
  allowedExternalEmails: [],
  smtp: { host: 'smtp', port: 587, tls: true, username: '', password: '', fromAddress: 'helpdesk@epbih.ba' },
  presentation: { appName: 'Service Desk', accentColor: '#4f46e5', publicUrl: 'https://desk.example', defaultLocale: 'bs' },
  templates: defaultEmailTemplates,
} as never;

describe('scheduled report e-mail', () => {
  it('renders the tables, escapes names and links to the Trends tab', () => {
    const preview = composeScheduledReportPreview({
      configuration: channel,
      templates: defaultEmailTemplates,
      locale: 'bs',
      recipientName: '<Amra>',
    });
    expect(preview.subject).toBe('Mjesečni izvještaj IT podrške — septembar 2026.');
    expect(preview.html).toContain('Sažetak');
    expect(preview.html).toContain('Najčešći servisi');
    expect(preview.html).toContain('&lt;Amra&gt;');
    expect(preview.html).not.toContain('<Amra>');
    expect(preview.html).toContain('https://desk.example/reports?tab=trends');
    expect(preview.html).not.toMatch(/<svg|<script/i);
    expect(preview.text).toContain('Dolazni tiketi');
    expect(preview.text).toContain('postavio/la Amra Hodžić');
  });

  it('prefixes a test e-mail and lists the omitted attachments', () => {
    const base = composeScheduledReportPreview({
      configuration: channel,
      templates: defaultEmailTemplates,
      locale: 'en',
      recipientName: 'Amra',
    });
    expect(base.subject.startsWith('Monthly IT support report')).toBe(true);
    const composed = composeScheduledReportEmail({
      configuration: channel,
      locale: 'en',
      recipientId: 'u1',
      recipientName: 'Amra',
      scheduleName: 'Weekly',
      ownerName: null,
      content: {
        frequency: 'WEEKLY',
        sections: ['kpi'],
        period: {
          start: new Date('2026-03-22T23:00:00Z'),
          end: new Date('2026-03-29T22:00:00Z'),
          firstDay: { year: 2026, month: 3, day: 23 },
          lastDay: { year: 2026, month: 3, day: 29 },
        },
        scope: {
          organizationalUnitId: 'ou-it',
          unitName: 'IT',
          serviceId: 'svc',
          serviceName: 'VPN',
          groupId: null,
          groupName: null,
          priority: 'HIGH',
        },
        trendPoints: [],
        topServices: null,
        overdue: null,
        settings: { slaTargetPercent: 90, csatMinSample: 5 },
        trendFirstDay: { year: 2026, month: 1, day: 5 },
      },
      attachmentNames: [],
      omitted: [{ pack: 'monthly_kpi', reason: 'too_many_rows' }],
      attachmentMaxRows: 10_000,
      dedupeKey: 'k',
      test: true,
    });
    expect(composed.subject).toBe('[TEST] Weekly — 23/03/2026 – 29/03/2026');
    expect(composed.text).toContain('Attachment "Monthly KPI" was left out');
    expect(composed.text).toContain('IT, service VPN, priority high');
    expect(composed.text).toContain('This report is sent by the schedule "Weekly".');
  });

  it('builds the trends link with the schedule filters', () => {
    const query = trendsLinkQuery({
      frequency: 'MONTHLY',
      sections: [],
      period: {
        start: new Date(0),
        end: new Date(0),
        firstDay: { year: 2026, month: 2, day: 1 },
        lastDay: { year: 2026, month: 2, day: 28 },
      },
      scope: {
        organizationalUnitId: 'ou-it',
        unitName: 'IT',
        serviceId: null,
        serviceName: null,
        groupId: 'grp',
        groupName: 'G',
        priority: null,
      },
      trendPoints: [],
      topServices: null,
      overdue: null,
      settings: { slaTargetPercent: 90, csatMinSample: 5 },
      trendFirstDay: { year: 2025, month: 3, day: 1 },
    });
    expect(query).toBe(
      'tab=trends&organizationalUnitId=ou-it&from=2025-03-01&to=2026-02-28&granularity=month&groupId=grp',
    );
  });
});

function schedule(overrides: Partial<ReportScheduleRecord> = {}): ReportScheduleRecord {
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
    nextRunAt: new Date('2026-03-30T05:00:00Z'),
    lastRunAt: null,
    createdByUserId: 'admin',
    updatedByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: { id: 'admin', displayName: 'Admin' },
    organizationalUnit: { id: 'ou-it', name: 'IT' },
    service: null,
    group: null,
    recipients: [
      { userId: 'u-ok', user: { id: 'u-ok', displayName: 'Ok', email: 'ok@epbih.ba', isActive: true } },
      { userId: 'u-gone', user: { id: 'u-gone', displayName: 'Gone', email: 'gone@epbih.ba', isActive: false } },
    ],
    ...overrides,
  };
}

function createRunner(options: { due: ReportScheduleRecord[]; claimConflict?: boolean }) {
  const runs: Record<string, unknown>[] = [];
  const sent: { to: string; subject: string }[] = [];
  const scheduleUpdates: unknown[] = [];
  const prisma = {
    $executeRaw: async () => 0,
    auditLog: { findFirst: async () => null, create: async () => ({}) },
    reportSchedule: {
      findMany: async () => options.due,
      updateMany: async (args: unknown) => {
        scheduleUpdates.push(args);
        return { count: 1 };
      },
    },
    reportScheduleRun: {
      createMany: jest.fn(async (args: { data: Record<string, unknown>[] }) => {
        runs.push(...args.data);
        return { count: args.data.length };
      }),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        if (options.claimConflict === true) throw Object.assign(new Error('unique'), { code: 'P2002' });
        runs.push({ ...args.data, id: `run-${runs.length + 1}` });
        return { id: `run-${runs.length}` };
      }),
      updateMany: jest.fn(async () => ({ count: 0 })),
      findUnique: async () => null,
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        runs.push({ final: args.data });
        return {};
      }),
      deleteMany: async () => ({ count: 0 }),
    },
    notificationEmailDelivery: {
      create: async () => ({}),
      update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
      deleteMany: async () => ({ count: 0 }),
      findUnique: async () => null,
    },
  };
  const trendPoint = {
    key: '2026-03-23',
    start: '',
    end: '',
    partial: false,
    created: 10,
    resolved: 8,
    net: 2,
    backlog: 4,
    firstResponse: { medianHours: 1, p90Hours: 2, sampleCount: 10 },
    resolution: { medianHours: 5, p90Hours: 9, sampleCount: 8 },
    slaResponse: { total: 10, met: 9, percent: 90 },
    slaResolution: { total: 8, met: 6, percent: 75 },
    csat: { count: 2, average: 4.5, satisfiedPercent: 100, lowSample: true },
  };
  const settings = {
    getSetting: async (key: string) => {
      const values: Record<string, unknown> = {
        'private.notifications.email.internalDomainsCsv': 'epbih.ba',
        'private.notifications.email.enabled': true,
        'private.smtp.enabled': true,
        'private.smtp.provider': 'smtp',
        'private.smtp.host': 'smtp.epbih.ba',
        'private.smtp.port': 587,
        'private.smtp.fromAddress': 'helpdesk@epbih.ba',
        'private.addons.email': true,
      };
      return values[key];
    },
    getSecretForInternalUse: async () => '',
  };
  const runner = new ScheduledReportRunner(
    prisma as never,
    settings as never,
    {
      computeForSchedule: async () => ({
        points: [trendPoint, trendPoint],
        topServices: { items: [], other: { current: 0, previous: 0 }, totalCurrent: 0, totalPrevious: 0 },
        settings: { slaTargetPercent: 90, csatMinSample: 5, csatScaleMax: 5, csatSatisfiedMinRating: 4 },
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
        pingPongThreshold: 3,
      }),
    } as never,
    {
      load: async () => ({
        enabled: true,
        maxSchedules: 50,
        maxRecipients: 25,
        attachmentMaxRows: 10_000,
        defaultSendTime: '07:00',
        timeZone: zone,
      }),
    } as never,
    {
      evaluate: async (ids: string[]) =>
        ids.map((id) =>
          id === 'u-ok'
            ? {
                ok: true,
                user: { id, email: 'ok@epbih.ba', displayName: 'Ok', preferredLocale: 'bs', isLocalOnly: false, isActive: true },
              }
            : { ok: false, userId: id, reason: 'inactive' },
        ),
    } as never,
    { send: async (message: { to: string; subject: string }) => void sent.push(message) },
  );
  return { runner, runs, sent, prisma, scheduleUpdates };
}

describe('ScheduledReportRunner sweep (design §5.4)', () => {
  it('logs older missed slots as SKIPPED and claims only the latest one', async () => {
    const { runner, runs, prisma, scheduleUpdates } = createRunner({ due: [schedule()] });
    // Worker was down for two Mondays.
    await runner.runDue(new Date('2026-04-13T08:00:00Z'));
    expect(prisma.reportScheduleRun.createMany).toHaveBeenCalledTimes(1);
    const missed = runs.filter((run) => run.status === 'SKIPPED');
    expect(missed.map((run) => run.errorCode)).toEqual(['missed', 'missed']);
    const claimed = runs.find((run) => run.status === 'RUNNING');
    expect(claimed?.slotKey).toBe('sch-1:2026-04-05T22:00:00.000Z');
    expect(JSON.stringify(scheduleUpdates[0])).toContain('2026-04-20T05:00:00.000Z');
  });

  it('sends only to eligible recipients and records the skipped ones', async () => {
    const { runner, runs, sent } = createRunner({ due: [schedule()] });
    await runner.runDue(new Date('2026-03-30T05:01:00Z'));
    expect(sent.map((message) => message.to)).toEqual(['ok@epbih.ba']);
    const final = runs.find((run) => 'final' in run)?.final as Record<string, unknown>;
    expect(final).toMatchObject({
      status: 'PARTIAL',
      recipientCount: 2,
      sentCount: 1,
      skipped: [{ userId: 'u-gone', reason: 'inactive' }],
    });
  });

  it('never sends twice when another worker already claimed the slot', async () => {
    const { runner, sent, prisma, scheduleUpdates } = createRunner({
      due: [schedule({ nextRunAt: new Date('2026-04-13T05:00:00Z') })],
      claimConflict: true,
    });
    await runner.runDue(new Date('2026-04-13T05:02:00Z'));
    expect(prisma.reportScheduleRun.updateMany).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(0);
    expect(prisma.reportScheduleRun.update).not.toHaveBeenCalled();
    expect(scheduleUpdates).toHaveLength(1);
  });

  it('builds a stable slot key per period', () => {
    const period = previousReportPeriod('WEEKLY', zone, new Date('2026-04-13T05:00:00Z'));
    expect(slotKeyOf('sch-1', period)).toBe('sch-1:2026-04-05T22:00:00.000Z');
  });
});
