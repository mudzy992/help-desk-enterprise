jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../notifications/email/load-email-channel-configuration', () => ({ loadEmailChannelConfiguration: jest.fn() }));
jest.mock('../notifications/email/deliver-notification-email', () => ({ deliverNotificationEmail: jest.fn() }));

import { defaultEmailTemplates } from '../notifications/email/default-email-templates';
import { deliverNotificationEmail } from '../notifications/email/deliver-notification-email';
import { renderEmailTemplatePreview } from '../notifications/email/email-template-preview';
import type { EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { loadEmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { settingKeys } from '../settings/setting-keys';
import {
  AnnouncementDeliveryService,
  announcementEmailBatchSize,
  decideAnnouncementEmail,
} from './announcement-delivery.service';
import { buildAnnouncementTeamsCard } from './announcement-teams-card';
import { announcementMarkdownToText, composeAnnouncementEmail } from './compose-announcement-email';

const now = new Date('2026-10-05T08:00:00.000Z');

const channel = {
  deliveryEnabled: true,
  internalOnly: true,
  internalDomains: ['example.com'],
  allowedExternalDomains: [],
  allowedExternalEmails: [],
  smtp: { host: 'smtp.example.com', port: 587, tls: true, username: 'u', password: 'p', fromAddress: 'desk@example.com' },
  templates: defaultEmailTemplates,
  presentation: {
    appName: 'Help Desk',
    publicUrl: 'https://desk.example.com',
    accentColor: '#4F46E5',
    includeMessageExcerpt: false,
    replyMode: 'no_reply',
    configuredReplyMode: 'no_reply',
    replyToAddress: null,
    defaultLocale: 'bs',
    fallbackLocale: 'bs',
    supportedLocales: ['bs', 'en'],
  },
} as unknown as EmailChannelConfiguration;

const announcement = {
  id: 'a1',
  title: 'Održavanje e-maila',
  body: '## Plan\n\nU subotu od **08:00** do _12:00_.\n\n- Pogledajte [upute](https://docs.example.com/x)\n- Opasan [link](javascript:void)\n\nCijena 5\\*3',
  severity: 'WARNING' as const,
  startsAt: new Date('2026-10-05T06:00:00.000Z'),
  endsAt: new Date('2026-10-06T06:00:00.000Z'),
};

describe('announcement e-mail content', () => {
  it('turns the Markdown subset into readable text and drops unsafe links', () => {
    expect(announcementMarkdownToText(announcement.body)).toBe(
      'Plan\n\nU subotu od 08:00 do 12:00.\n\n• Pogledajte upute (https://docs.example.com/x)\n• Opasan link\n\nCijena 5*3',
    );
  });

  it('renders subject, body, period, severity colour and the archive link', () => {
    const composed = composeAnnouncementEmail({
      configuration: channel,
      locale: 'bs',
      timeZone: 'Europe/Sarajevo',
      kind: 'PUBLISHED',
      recipientKey: 'u1',
      recipientName: 'Ana',
      announcement,
      dedupeKey: 'announcement-email:r1',
    });
    expect(composed.subject).toBe('Najava: Održavanje e-maila');
    expect(composed.text).toContain('Poštovani/a Ana');
    expect(composed.text).toContain('Pogledajte upute (https://docs.example.com/x)');
    expect(composed.text).toContain('08:00');
    expect(composed.html).toContain('https://desk.example.com/announcements?open=a1');
    expect(composed.html).toContain('#b45309');
    expect(composed.html).not.toContain('javascript:');
    expect(composed.headers['X-Priority']).toBe('3');
    expect(composed.messageId).toMatch(/^<[0-9a-f]{32}@example\.com>$/);
  });

  it('has a reminder variant and an editor preview for both keys', () => {
    const reminder = composeAnnouncementEmail({
      configuration: channel,
      locale: 'en',
      timeZone: 'UTC',
      kind: 'REMINDER',
      recipientKey: 'u1',
      recipientName: 'Ana',
      announcement: { ...announcement, severity: 'CRITICAL' },
      dedupeKey: 'announcement-email:r2',
    });
    expect(reminder.subject).toContain('Reminder');
    expect(reminder.headers['X-Priority']).toBe('1');
    for (const key of ['announcement.published', 'announcement.reminder'] as const) {
      const preview = renderEmailTemplatePreview({
        configuration: channel,
        templates: defaultEmailTemplates,
        key,
        locale: 'bs',
        recipientName: 'Ana',
        recipientEmail: 'ana@example.com',
      } as never);
      expect(preview.subject.length).toBeGreaterThan(0);
      expect(preview.html).toContain('08:00');
    }
  });

  it('builds a Teams card with severity, period, service and the open link', () => {
    const card = JSON.stringify(
      buildAnnouncementTeamsCard({
        announcement: { ...announcement, severity: 'CRITICAL', serviceName: 'E-mail' },
        locale: 'bs',
        timeZone: 'Europe/Sarajevo',
        appName: 'Help Desk',
        openUrl: 'https://desk.example.com/announcements?open=a1',
      }),
    );
    expect(card).toContain('Help Desk: Održavanje e-maila');
    expect(card).toContain('"color":"Attention"');
    expect(card).toContain('Kritično');
    expect(card).toContain('"value":"E-mail"');
    expect(card).toContain('Action.OpenUrl');
  });
});

describe('decideAnnouncementEmail', () => {
  const decision = (email: 'IMMEDIATE' | 'DIGEST' | 'QUIET' | 'OFF') => ({ inApp: true, email, quiet: email === 'QUIET' });
  it('honours OFF, sends IMMEDIATE and lets only CRITICAL through digest/quiet hours', () => {
    expect(decideAnnouncementEmail(undefined, 'INFO')).toBe('SEND');
    expect(decideAnnouncementEmail(decision('IMMEDIATE'), 'INFO')).toBe('SEND');
    expect(decideAnnouncementEmail(decision('OFF'), 'CRITICAL')).toBe('PREFERENCE_OFF');
    expect(decideAnnouncementEmail(decision('DIGEST'), 'WARNING')).toBe('NOT_IMMEDIATE');
    expect(decideAnnouncementEmail(decision('QUIET'), 'INFO')).toBe('NOT_IMMEDIATE');
    expect(decideAnnouncementEmail(decision('DIGEST'), 'CRITICAL')).toBe('SEND');
    expect(decideAnnouncementEmail(decision('QUIET'), 'CRITICAL')).toBe('SEND');
  });
});

type Run = { id: string; kind: 'PUBLISHED' | 'REMINDER'; cursor: string | null; completedAt?: Date | null; [key: string]: unknown };

function setup(options: {
  users: { id: string; email: string }[];
  run?: Partial<Run>;
  announcementOverrides?: Record<string, unknown>;
  teams?: { enabled: boolean; url?: string; opsUrl?: string };
  teamsDue?: boolean;
}) {
  const runUpdates: Record<string, unknown>[] = [];
  const runsUpdateMany: Record<string, unknown>[] = [];
  const announcementUpdates: Record<string, unknown>[] = [];
  const run = {
    id: 'r1',
    kind: 'PUBLISHED' as const,
    cursor: null,
    ...options.run,
    announcement: {
      ...announcement,
      status: 'PUBLISHED',
      sendEmail: true,
      requiresAcknowledgement: true,
      audienceRoles: [],
      audienceOrganizationalUnitIds: [],
      audienceGroupIds: [],
      ...options.announcementOverrides,
    },
  };
  const userQueries: Record<string, unknown>[] = [];
  const prisma = {
    announcementEmailRun: {
      findMany: jest.fn(async () => [run]),
      update: jest.fn(async (args: Record<string, unknown>) => {
        runUpdates.push(args);
        return {};
      }),
      updateMany: jest.fn(async (args: Record<string, unknown>) => {
        runsUpdateMany.push(args);
        return { count: 1 };
      }),
    },
    user: {
      findMany: jest.fn(async (args: { where: { id?: { gt: string } }; take: number }) => {
        userQueries.push(args as never);
        const after = args.where.id?.gt ?? '';
        return options.users
          .filter((user) => user.id > after)
          .slice(0, args.take)
          .map((user) => ({ ...user, displayName: user.id, preferredLocale: 'bs' }));
      }),
    },
    announcement: {
      findMany: jest.fn(async () =>
        options.teamsDue ? [{ ...announcement, severity: 'CRITICAL', service: null }] : [],
      ),
      updateMany: jest.fn(async (args: Record<string, unknown>) => {
        announcementUpdates.push(args);
        return { count: 1 };
      }),
      update: jest.fn(async (args: Record<string, unknown>) => {
        announcementUpdates.push(args);
        return {};
      }),
    },
  };
  const settings = {
    getSetting: jest.fn(async (key: string) =>
      key === settingKeys.privateAnnouncementsTeamsEnabled ? (options.teams?.enabled ?? false) : undefined,
    ),
    getSecretForInternalUse: jest.fn(async (key: string) =>
      key === settingKeys.privateAnnouncementsTeamsWebhookUrl
        ? (options.teams?.url ?? '')
        : key === settingKeys.privateOpsAlertsTeamsWebhookUrl
          ? (options.teams?.opsUrl ?? '')
          : undefined,
    ),
  };
  const announcements = { audienceWhereFor: jest.fn(async () => ({ isActive: true, anonymizedAt: null })) };
  const teams = jest.fn(async () => undefined);
  const service = new AnnouncementDeliveryService(
    prisma as never,
    settings as never,
    announcements as never,
    {} as never,
    teams,
  );
  return { service, prisma, runUpdates, runsUpdateMany, announcementUpdates, teams, userQueries };
}

describe('AnnouncementDeliveryService', () => {
  beforeEach(() => {
    jest.mocked(loadEmailChannelConfiguration).mockResolvedValue(channel);
    jest.mocked(deliverNotificationEmail).mockReset().mockResolvedValue(undefined);
  });

  it('mails allowed audience members in id batches and completes the run', async () => {
    const users = Array.from({ length: announcementEmailBatchSize + 3 }, (_, index) => ({
      id: `u${String(index).padStart(4, '0')}`,
      email: index === 1 ? 'vanjski@other.test' : `u${index}@example.com`,
    }));
    const { service, runUpdates } = setup({ users });
    const result = await service.run(now, 60_000);
    expect(result.emailed).toBe(users.length - 1);
    expect(runUpdates).toHaveLength(2);
    expect(runUpdates[0]).toMatchObject({ data: { cursor: users[announcementEmailBatchSize - 1]?.id, sentCount: { increment: announcementEmailBatchSize - 1 }, skippedCount: { increment: 1 } } });
    expect((runUpdates[1] as { data: { completedAt?: Date } }).data.completedAt).toBeInstanceOf(Date);
    const first = jest.mocked(deliverNotificationEmail).mock.calls[0]?.[3];
    expect(first).toMatchObject({ dedupeKey: 'announcement-email:r1', templateKey: 'announcement.published' });
  });

  it('continues after the stored cursor and asks reminders only of those who did not acknowledge', async () => {
    const { service, userQueries } = setup({
      users: [{ id: 'u1', email: 'a@example.com' }, { id: 'u2', email: 'b@example.com' }],
      run: { kind: 'REMINDER', cursor: 'u1' },
    });
    const result = await service.run(now, 60_000);
    expect(result.emailed).toBe(1);
    expect(userQueries[0]).toMatchObject({
      where: { id: { gt: 'u1' }, announcementAcknowledgements: { none: { announcementId: 'a1' } } },
    });
    expect(jest.mocked(deliverNotificationEmail).mock.calls[0]?.[3]).toMatchObject({ templateKey: 'announcement.reminder' });
  });

  it('closes runs when the channel is off or the announcement is no longer active', async () => {
    jest.mocked(loadEmailChannelConfiguration).mockResolvedValueOnce({ ...channel, deliveryEnabled: false } as never);
    const off = setup({ users: [{ id: 'u1', email: 'a@example.com' }] });
    await off.service.run(now, 60_000);
    expect(off.runsUpdateMany[0]).toMatchObject({ data: { endReason: 'EMAIL_CHANNEL_DISABLED' } });

    const withdrawn = setup({ users: [{ id: 'u1', email: 'a@example.com' }], announcementOverrides: { status: 'WITHDRAWN' } });
    await withdrawn.service.run(now, 60_000);
    expect(withdrawn.runUpdates[0]).toMatchObject({ data: { endReason: 'NOT_ACTIVE' } });
    expect(deliverNotificationEmail).not.toHaveBeenCalled();
  });

  it('counts a failed send and carries on', async () => {
    jest.mocked(deliverNotificationEmail).mockRejectedValueOnce(new Error('SMTP 451'));
    const { service, runUpdates } = setup({ users: [{ id: 'u1', email: 'a@example.com' }, { id: 'u2', email: 'b@example.com' }] });
    const result = await service.run(now, 60_000);
    expect(result.emailed).toBe(1);
    expect(runUpdates[0]).toMatchObject({ data: { failedCount: { increment: 1 }, sentCount: { increment: 1 } } });
  });

  it('posts to Teams once when enabled, falling back to the alarm webhook', async () => {
    const { service, teams, announcementUpdates } = setup({
      users: [],
      teams: { enabled: true, opsUrl: 'https://hooks.example.com/ops' },
      teamsDue: true,
    });
    const result = await service.run(now, 60_000);
    expect(result.teamsPosted).toBe(1);
    expect(teams).toHaveBeenCalledWith('https://hooks.example.com/ops', expect.any(Object));
    expect(announcementUpdates.at(-1)).toMatchObject({ data: { teamsResult: 'SENT' } });
  });

  it('marks a ticked Teams post as skipped when Teams is switched off', async () => {
    const { service, teams, announcementUpdates } = setup({ users: [], teams: { enabled: false }, teamsDue: true });
    await service.run(now, 60_000);
    expect(teams).not.toHaveBeenCalled();
    expect(announcementUpdates[0]).toMatchObject({ data: { teamsResult: 'SKIPPED_DISABLED' } });
  });
});
