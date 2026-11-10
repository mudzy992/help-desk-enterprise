import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import { composeWeeklyTicketReportEmail } from '../email/compose-weekly-ticket-report-email';
import { deliverNotificationEmail } from '../email/deliver-notification-email';
import { loadEmailChannelConfiguration } from '../email/load-email-channel-configuration';
import { loadTicketSlaSnapshots } from '../../tickets/load-ticket-sla-snapshots';
import { loadNotificationPreferencePolicy } from './notification-preference-policy';
import {
  WeeklyTicketReportService,
  weeklyReportCategory,
} from './weekly-ticket-report.service';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../email/load-email-channel-configuration', () => ({
  loadEmailChannelConfiguration: jest.fn(),
}));
jest.mock('../email/deliver-notification-email', () => ({
  deliverNotificationEmail: jest.fn(async () => true),
}));
jest.mock('../email/compose-weekly-ticket-report-email', () => ({
  composeWeeklyTicketReportEmail: jest.fn(() => ({
    subject: 'Sedmični pregled',
    text: 'report',
    html: '<p>report</p>',
    messageId: 'message-1',
    headers: {},
  })),
}));
jest.mock('../../tickets/load-ticket-sla-snapshots', () => ({
  loadTicketSlaSnapshots: jest.fn(async () => new Map()),
}));
jest.mock('./notification-preference-policy', () => ({
  loadNotificationPreferencePolicy: jest.fn(async () => ({
    preferencesEnabled: true,
    lockedEmail: new Set<string>(),
    timeZone: 'Europe/Sarajevo',
  })),
}));

const configuration = {
  deliveryEnabled: true,
  smtpEnabled: true,
  emailAddonEnabled: true,
  notificationsEmailEnabled: true,
  slaEscalationEmailEnabled: true,
  templatesEnabled: true,
  internalOnly: false,
  internalDomains: [],
  allowedExternalDomains: [],
  allowedExternalEmails: [],
  templates: {},
  smtp: { fromAddress: 'helpdesk@example.com' },
  presentation: {
    supportedLocales: ['bs', 'en'],
    defaultLocale: 'bs',
    fallbackLocale: 'en',
  },
};

/**
 * M13 (val 4/5): the weekly report is the only notification with a weekly slot,
 * a "late is skipped" window and a per-user opt-out via the e-mail preference
 * `OFF`. Those rules were untested.
 */
describe('WeeklyTicketReportService (M13)', () => {
  const agent = {
    id: 'agent-1',
    email: 'agent@example.com',
    displayName: 'Agent One',
    preferredLocale: 'bs',
  };

  function createService(
    options: {
      readonly users?: readonly (typeof agent)[];
      readonly optedOut?: readonly string[];
      readonly settings?: Record<string, unknown>;
      readonly deliveryEnabled?: boolean;
      readonly tickets?: readonly Record<string, unknown>[];
    } = {},
  ) {
    const users = options.users ?? [agent];
    const scheduleUpserts: unknown[] = [];
    const settings: SettingsService = {
      getSetting: async (key: string) => options.settings?.[key],
    } as unknown as SettingsService;
    const ticket = {
      id: 'ticket-1',
      ticketNumber: 101,
      title: 'VPN ne radi',
      status: 'OPEN',
      priority: 'HIGH',
      isConfidential: false,
      classification: 'INTERNAL',
      createdAt: new Date('2026-10-01T08:00:00.000Z'),
      updatedAt: new Date('2026-10-02T08:00:00.000Z'),
      assignedUserId: 'agent-1',
    };
    const prisma = {
      user: {
        findMany: async () => users,
        findUnique: async ({ where }: { where: { id: string } }) =>
          users.find((user) => user.id === where.id) ?? null,
      },
      userNotificationPreference: {
        findMany: async () =>
          (options.optedOut ?? []).map((userId) => ({ userId })),
      },
      ticket: {
        findMany: async () => options.tickets ?? [ticket],
      },
      ticketParticipant: {
        findMany: async () => [],
      },
      userNotificationSchedule: {
        upsert: async (input: unknown) => {
          scheduleUpserts.push(input);
        },
      },
    };
    const transport = { send: jest.fn(async () => undefined) };
    (loadEmailChannelConfiguration as jest.Mock).mockResolvedValue({
      ...configuration,
      deliveryEnabled: options.deliveryEnabled ?? true,
    });
    return {
      service: new WeeklyTicketReportService(
        prisma as never,
        settings,
        transport,
      ),
      transport,
      scheduleUpserts,
      users,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to the documented defaults for a bad configuration', async () => {
    const { service } = createService({
      settings: {
        [settingKeys.privateNotificationsWeeklyReportDayOfWeek]: 9,
        [settingKeys.privateNotificationsWeeklyReportTime]: '25:99',
        [settingKeys.privateNotificationsWeeklyReportMaxRows]: 5,
      },
    });

    await expect(service.loadConfiguration()).resolves.toMatchObject({
      enabled: true,
      dayOfWeek: 1,
      minute: 7 * 60,
      maxRows: 100,
      sendWhenEmpty: false,
      timeZone: 'Europe/Sarajevo',
    });
  });

  it('honours the configured day, time and row limit', async () => {
    const { service } = createService({
      settings: {
        [settingKeys.privateNotificationsWeeklyReportEnabled]: false,
        [settingKeys.privateNotificationsWeeklyReportDayOfWeek]: 3,
        [settingKeys.privateNotificationsWeeklyReportTime]: '06:45',
        [settingKeys.privateNotificationsWeeklyReportMaxRows]: 25,
        [settingKeys.privateNotificationsWeeklyReportSendWhenEmpty]: true,
      },
    });

    await expect(service.loadConfiguration()).resolves.toMatchObject({
      enabled: false,
      dayOfWeek: 3,
      minute: 405,
      maxRows: 25,
      sendWhenEmpty: true,
    });
  });

  it('does nothing when the report or the e-mail channel is off', async () => {
    const { service } = createService({
      settings: { [settingKeys.privateNotificationsWeeklyReportEnabled]: false },
    });
    const now = new Date('2026-10-05T05:30:00.000Z');
    await expect(service.runDue(now)).resolves.toEqual({
      considered: 0,
      sent: 0,
      skipped: 0,
      failures: 0,
    });
    expect(deliverNotificationEmail).not.toHaveBeenCalled();

    const disabledChannel = createService({ deliveryEnabled: false });
    await expect(disabledChannel.service.runDue(now)).resolves.toEqual({
      considered: 0,
      sent: 0,
      skipped: 0,
      failures: 0,
    });
  });

  it('skips a slot missed by more than a day', async () => {
    const { service } = createService();
    // Monday 07:00 local was two days earlier: the weekly mail is stale.
    await expect(
      service.runDue(new Date('2026-10-07T05:30:00.000Z')),
    ).resolves.toEqual({ considered: 0, sent: 0, skipped: 0, failures: 0 });
    expect(deliverNotificationEmail).not.toHaveBeenCalled();
  });

  it('sends the report to an agent with open tickets and marks the slot', async () => {
    const { service, scheduleUpserts } = createService();

    const result = await service.runDue(new Date('2026-10-05T05:30:00.000Z'));

    expect(result).toEqual({ considered: 1, sent: 1, skipped: 0, failures: 0 });
    expect(deliverNotificationEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        toAddress: 'agent@example.com',
        templateKey: 'report.weekly_tickets',
        dedupeKey: 'weekly:2026-W41',
      }),
    );
    expect(scheduleUpserts).toEqual([
      expect.objectContaining({
        update: { lastWeeklyReportAt: new Date('2026-10-05T05:00:00.000Z') },
      }),
    ]);
  });

  it('skips an agent who switched the category off', async () => {
    const { service, scheduleUpserts } = createService({
      optedOut: ['agent-1'],
    });

    const result = await service.runDue(new Date('2026-10-05T05:30:00.000Z'));

    expect(result).toEqual({ considered: 1, sent: 0, skipped: 1, failures: 0 });
    expect(deliverNotificationEmail).not.toHaveBeenCalled();
    // The slot is consumed even for a skip, so the next pass does not retry it.
    expect(scheduleUpserts).toEqual([
      expect.objectContaining({
        update: { lastWeeklyReportAt: new Date('2026-10-05T05:00:00.000Z') },
      }),
    ]);
  });

  it('skips an empty report unless the administrator asks for it', async () => {
    const empty = createService({ tickets: [] });
    await expect(
      empty.service.runDue(new Date('2026-10-05T05:30:00.000Z')),
    ).resolves.toMatchObject({ sent: 0, skipped: 1 });

    const sendEmpty = createService({
      tickets: [],
      settings: { [settingKeys.privateNotificationsWeeklyReportSendWhenEmpty]: true },
    });
    await expect(
      sendEmpty.service.runDue(new Date('2026-10-05T05:30:00.000Z')),
    ).resolves.toMatchObject({ sent: 1 });
  });

  it('does not let an administrator lock the weekly opt-out', async () => {
    (loadNotificationPreferencePolicy as jest.Mock).mockResolvedValueOnce({
      preferencesEnabled: true,
      lockedEmail: new Set([weeklyReportCategory]),
      timeZone: 'Europe/Sarajevo',
    });
    const { service } = createService({ optedOut: ['agent-1'] });

    await expect(
      service.runDue(new Date('2026-10-05T05:30:00.000Z')),
    ).resolves.toMatchObject({ sent: 1, skipped: 0 });
  });

  it('counts a broken address as a failure and still consumes the slot', async () => {
    (deliverNotificationEmail as jest.Mock).mockRejectedValueOnce(
      new Error('mailbox does not exist'),
    );
    const { service, scheduleUpserts } = createService();

    await expect(
      service.runDue(new Date('2026-10-05T05:30:00.000Z')),
    ).resolves.toMatchObject({ failures: 1, sent: 0 });
    expect(scheduleUpserts).toHaveLength(1);
  });

  it('explains why a test report was not sent, and sends [TEST] when it is', async () => {
    const disabled = createService({ deliveryEnabled: false });
    await expect(disabled.service.sendTest('agent-1')).resolves.toEqual({
      sent: false,
      reason: 'EMAIL_CHANNEL_DISABLED',
    });

    const { service, transport } = createService();
    await expect(service.sendTest('missing')).resolves.toEqual({
      sent: false,
      reason: 'USER_NOT_FOUND',
    });
    await expect(service.sendTest('agent-1')).resolves.toEqual({ sent: true });
    expect(composeWeeklyTicketReportEmail).toHaveBeenCalled();
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'agent@example.com',
        subject: '[TEST] Sedmični pregled',
      }),
      expect.anything(),
    );
    expect(loadTicketSlaSnapshots).toHaveBeenCalled();
  });
});
