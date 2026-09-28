jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../notifications/email/load-email-channel-configuration', () => ({ loadEmailChannelConfiguration: jest.fn() }));
jest.mock('../notifications/email/deliver-notification-email', () => ({ deliverNotificationEmail: jest.fn() }));
jest.mock('../notifications/fan-out/persist-in-app-notification', () => ({ persistInAppNotification: jest.fn() }));

import { defaultEmailTemplates } from '../notifications/email/default-email-templates';
import { deliverNotificationEmail } from '../notifications/email/deliver-notification-email';
import { renderEmailTemplatePreview } from '../notifications/email/email-template-preview';
import type { EmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { loadEmailChannelConfiguration } from '../notifications/email/load-email-channel-configuration';
import { persistInAppNotification } from '../notifications/fan-out/persist-in-app-notification';
import { composeOpsAlertEmail } from './compose-ops-alert-email';
import { OpsAlertNotifier } from './ops-alert-notifier.service';
import { opsAlertStateLine, opsSeverityColors, type OpsAlertMessage } from './ops-alert-presentation';
import { fallbackOpsConfiguration } from './ops-configuration.loader';
import { fallbackDedupeMs, OpsFallbackNotifier, readFallbackConfiguration } from './ops-fallback-notifier';
import { buildTeamsAlertCard } from './teams-webhook';

const now = new Date('2026-11-20T10:00:00.000Z');

const channel = {
  deliveryEnabled: true,
  smtp: { host: 'smtp.x.ba', port: 587, tls: true, username: 'u', password: 'p', fromAddress: 'desk@epbih.ba' },
  templates: defaultEmailTemplates,
  presentation: {
    appName: 'EP Help Desk',
    publicUrl: 'https://desk.epbih.ba',
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

const diskMessage: OpsAlertMessage = {
  key: 'disk.usage',
  severity: 'CRITICAL',
  kind: 'opened',
  details: { usedPercent: 91.2, freeGb: 8.8, totalGb: 100 },
  firstSeenAt: new Date(now.getTime() - 2 * 60_000),
  resolvedAt: null,
};

describe('ops alert e-mail', () => {
  it('renders title, state line, numbers, the first step and the severity colour', () => {
    const composed = composeOpsAlertEmail({
      configuration: channel,
      locale: 'bs',
      recipientKey: 'u1',
      recipientName: 'Admin',
      message: diskMessage,
      dedupeKey: 'ops-alert:a1:opened:1',
      now,
    });
    expect(composed.subject).toBe('[KRITIČNO · novi alarm] Disk za priloge se puni');
    expect(composed.text).toContain('Zauzeto (%)');
    expect(composed.text).toContain('91,2');
    expect(composed.text).toContain('Oslobodite prostor');
    expect(composed.text).toContain('ops/runbook/ALERTS.md#disk-usage');
    expect(composed.html).toContain(`border-bottom:3px solid ${opsSeverityColors.CRITICAL.toLowerCase()}`);
    expect(composed.html).toContain('https://desk.epbih.ba/admin?tab=ops');
    expect(composed.headers['X-Priority']).toBe('1');
    expect(composed.messageId).toMatch(/^<[0-9a-f]{32}@epbih\.ba>$/);
  });

  it('keeps an explicit template colour and says how long a resolved alarm lasted', () => {
    const templates = {
      ...defaultEmailTemplates,
      en: { ...defaultEmailTemplates.en, 'ops.alert': { ...defaultEmailTemplates.en['ops.alert'], accentColor: '#123456' } },
    };
    const composed = composeOpsAlertEmail({
      configuration: channel,
      templates,
      locale: 'en',
      recipientKey: 'u1',
      recipientName: 'Admin',
      message: { ...diskMessage, kind: 'resolved', resolvedAt: new Date(diskMessage.firstSeenAt.getTime() + 75 * 60_000) },
      dedupeKey: 'k',
      now,
    });
    expect(composed.subject).toBe('[CRITICAL · resolved after 1 h 15 min] Attachment disk is filling up');
    expect(composed.html).toContain('border-bottom:3px solid #123456');
    expect(composed.headers['X-Priority']).toBe('3');
  });

  it('is available in the template editor preview', () => {
    const preview = renderEmailTemplatePreview({
      configuration: channel,
      templates: defaultEmailTemplates,
      key: 'ops.alert',
      locale: 'en',
      confidential: false,
      recipientName: 'Admin',
      recipientEmail: 'a@x.ba',
    });
    expect(preview.subject).toBe('[WARNING · new alarm] Attachment disk is filling up');
  });

  it('describes reminders with the elapsed time', () => {
    expect(opsAlertStateLine({ ...diskMessage, kind: 'reminder', firstSeenAt: new Date(now.getTime() - 4 * 3_600_000) }, 'bs', now)).toBe(
      'KRITIČNO · aktivno 4 h',
    );
  });
});

describe('Teams card', () => {
  it('is an Adaptive Card with facts, the first step and a link', () => {
    const card = buildTeamsAlertCard({ message: diskMessage, locale: 'en', appName: 'EP Help Desk', openUrl: 'https://desk/admin?tab=ops', now });
    const content = (card.attachments as Array<{ contentType: string; content: Record<string, unknown> }>)[0]!;
    expect(content.contentType).toBe('application/vnd.microsoft.card.adaptive');
    const body = content.content.body as Array<Record<string, unknown>>;
    expect(body[0]).toMatchObject({ text: 'EP Help Desk: Attachment disk is filling up', color: 'Attention' });
    expect((body[2]!.facts as Array<{ title: string }>).map((fact) => fact.title)).toContain('Used (%)');
    expect(content.content.actions).toEqual([{ type: 'Action.OpenUrl', title: 'Open system health', url: 'https://desk/admin?tab=ops' }]);
  });
});

describe('OpsFallbackNotifier', () => {
  it('reads only valid env values', () => {
    expect(
      readFallbackConfiguration({ OPS_ALERT_SMTP_URL: 'http://x', OPS_ALERT_EMAIL_TO: 'a@x.ba, bad', OPS_ALERT_TEAMS_WEBHOOK_URL: 'http://t' }),
    ).toEqual({ smtpUrl: null, emailTo: ['a@x.ba'], emailFrom: 'ephelpdesk-monitor@localhost', teamsWebhookUrl: null });
  });

  it('sends once per key and kind every 30 minutes, on both channels', async () => {
    let clock = now.getTime();
    const mailer = jest.fn(async () => undefined);
    const teams = jest.fn(async () => undefined);
    const notifier = new OpsFallbackNotifier(
      { smtpUrl: 'smtp://h:25', emailTo: ['it@x.ba'], emailFrom: 'm@x.ba', teamsWebhookUrl: 'https://t' },
      mailer,
      teams,
      () => clock,
    );
    expect(await notifier.notify(diskMessage)).toEqual(['email', 'teams']);
    expect(await notifier.notify(diskMessage)).toEqual([]);
    expect(await notifier.notify({ ...diskMessage, kind: 'resolved' })).toEqual(['email', 'teams']);
    clock += fallbackDedupeMs;
    expect(await notifier.notify(diskMessage)).toEqual(['email', 'teams']);
    expect((mailer.mock.calls[0] as unknown as [string, { to: string; subject: string }])[1]).toMatchObject({
      to: 'it@x.ba',
      subject: expect.stringContaining('Disk za priloge se puni / Attachment disk is filling up'),
    });
  });

  it('never throws when a channel fails', async () => {
    const notifier = new OpsFallbackNotifier(
      { smtpUrl: 'smtp://h:25', emailTo: ['it@x.ba'], emailFrom: 'm@x.ba', teamsWebhookUrl: null },
      async () => {
        throw new Error('ECONNREFUSED');
      },
    );
    expect(await notifier.notify(diskMessage)).toEqual([]);
  });
});

describe('OpsAlertNotifier', () => {
  const users = [
    { id: 'u1', email: 'admin@epbih.ba', displayName: 'Admin', preferredLocale: 'en' },
    { id: 'u2', email: 'super@epbih.ba', displayName: 'Super', preferredLocale: null },
  ];

  function setup(teams = jest.fn(async () => undefined)) {
    const prisma = { user: { findMany: jest.fn(async () => users) } };
    const transport = { send: jest.fn(async () => undefined) };
    return { prisma, transport, teams, notifier: new OpsAlertNotifier(prisma as never, {} as never, transport as never, teams) };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (loadEmailChannelConfiguration as jest.Mock).mockResolvedValue(channel);
    (deliverNotificationEmail as jest.Mock).mockResolvedValue(undefined);
    (persistInAppNotification as jest.Mock).mockResolvedValue({});
  });

  it('delivers to receivers, extra addresses (deduplicated), in-app and Teams', async () => {
    const { prisma, transport, teams, notifier } = setup();
    const results = await notifier.notify({
      message: diskMessage,
      configuration: { ...fallbackOpsConfiguration, extraRecipients: ['admin@epbih.ba', 'dezurni@epbih.ba'], teamsWebhookUrl: 'https://t' },
      dedupeKey: 'ops-alert:a1:opened:1',
      alertId: 'a1',
      now,
    });
    expect(results).toEqual([
      { channel: 'email', status: 'sent', delivered: 3, failed: 0, reason: null },
      { channel: 'inApp', status: 'sent', delivered: 2, failed: 0, reason: null },
      { channel: 'teams', status: 'sent', delivered: 1, failed: 0, reason: null },
    ]);
    const where = (prisma.user.findMany.mock.calls[0] as unknown as [{ where: unknown }])[0].where;
    expect(JSON.stringify(where)).toContain('ops.alerts.receive');
    expect(JSON.stringify(where)).toContain('SUPER_ADMIN');
    expect((deliverNotificationEmail as jest.Mock).mock.calls.map((call) => call[3].templateKey)).toEqual(['ops.alert', 'ops.alert']);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect((transport.send.mock.calls[0] as unknown as [{ to: string }])[0].to).toBe('dezurni@epbih.ba');
    expect((persistInAppNotification as jest.Mock).mock.calls[0][1]).toMatchObject({
      userId: 'u1',
      type: 'ops.alert',
      body: 'Disk za priloge se puni — KRITIČNO · novi alarm',
      dedupeKey: 'ops-alert:a1:opened:1:u1',
    });
    expect(teams).toHaveBeenCalledWith('https://t', expect.objectContaining({ type: 'message' }));
  });

  it('reports a disabled e-mail channel and a failing webhook without throwing', async () => {
    (loadEmailChannelConfiguration as jest.Mock).mockResolvedValue({ ...channel, deliveryEnabled: false });
    const { notifier } = setup(
      jest.fn(async () => {
        throw new Error('Teams webhook HTTP 400');
      }),
    );
    const results = await notifier.notify({
      message: diskMessage,
      configuration: { ...fallbackOpsConfiguration, teamsWebhookUrl: 'https://t' },
      dedupeKey: 'k',
      alertId: null,
      now,
    });
    expect(results[0]).toMatchObject({ channel: 'email', status: 'skipped', reason: 'email_channel_disabled' });
    expect(results[2]).toMatchObject({ channel: 'teams', status: 'failed', reason: 'Teams webhook HTTP 400' });
  });
});
