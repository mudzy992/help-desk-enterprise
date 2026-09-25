import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import { defaultEmailTemplates } from '../email/default-email-templates';
import type { MailTransport, OutboundMailMessage } from '../email/mail-transport';
import { assertEmailTemplateRegistryJson } from '../email/parse-email-template-registry';
import { EmailTemplatesService } from './email-templates.service';
import { createInMemoryAuditLogDelegate } from '../../audit-log/create-in-memory-audit-log-delegate';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createService(values: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = {
    [settingKeys.privateSmtpEnabled]: true,
    [settingKeys.privateSmtpFromAddress]: 'helpdesk@epbih.ba',
    [settingKeys.privateNotificationsTemplatesEnabled]: true,
    ...values,
  };
  const writes: { key: string; value: unknown; reason: string }[] = [];
  const settings = {
    getSetting: async (key: string) => store[key],
    getSecretForInternalUse: async () => 'secret',
    setSettingValue: async (key: string, value: unknown, mutation: { reason: string }) => {
      if (key === settingKeys.privateNotificationsTemplatesRegistryJson) {
        assertEmailTemplateRegistryJson(value as string);
      }
      store[key] = value;
      writes.push({ key, value, reason: mutation.reason });
    },
  } as unknown as SettingsService;
  const sent: OutboundMailMessage[] = [];
  const transport: MailTransport = { send: async (message) => void sent.push(message) };
  const auditLogs: Parameters<typeof createInMemoryAuditLogDelegate>[0] = [];
  let auditId = 0;
  const prisma = {
    ...createInMemoryAuditLogDelegate(auditLogs, () => `audit-${++auditId}`, () => new Date()),
    user: {
      findUnique: async () => ({ email: 'admin@epbih.ba', displayName: 'Admin Adminović' }),
    },
  };
  return {
    service: new EmailTemplatesService(settings, prisma as never, transport),
    writes,
    sent,
    store,
    auditLogs,
    prisma,
  };
}

describe('EmailTemplatesService', () => {
  it('describes templates, defaults and the delivery set-up', async () => {
    const { service } = createService();
    const overview = await service.overview();
    expect(overview.locales).toEqual(['bs', 'en']);
    expect(overview.keys).toContain('ticket.broadcast');
    expect(overview.templates).toEqual(defaultEmailTemplates);
    expect(overview.overrides).toEqual({});
    expect(overview.delivery).toMatchObject({
      hasSmtpTransport: true,
      provider: 'o365',
      replyMode: 'no_reply',
      fromAddress: 'helpdesk@epbih.ba',
    });
  });

  it('stores only the changed texts with the reason', async () => {
    const { service, writes } = createService();
    const overview = await service.save(
      {
        en: {
          'ticket.created': {
            ...defaultEmailTemplates.en['ticket.created'],
            heading: 'Fresh ticket',
          },
        },
      },
      { reason: 'Friendlier heading', actorUserId: 'admin' },
    );
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]?.value as string)).toEqual({
      version: 2,
      locales: { en: { 'ticket.created': { heading: 'Fresh ticket' } } },
    });
    expect(writes[0]?.reason).toBe('Friendlier heading');
    expect(overview.templates.en['ticket.created'].heading).toBe('Fresh ticket');
  });

  it('refuses unknown placeholders on save and preview', async () => {
    const { service, writes } = createService();
    await expect(
      service.save(
        { bs: { 'ticket.created': { subject: 'Hi {{password}}' } } },
        { reason: 'x', actorUserId: 'admin' },
      ),
    ).rejects.toThrow(/unsupported placeholder/);
    await expect(
      service.preview(
        { key: 'ticket.created', locale: 'bs', content: { body: '{{nope}}' } },
        'admin',
      ),
    ).rejects.toThrow(/unsupported placeholder/);
    expect(writes).toEqual([]);
  });

  it('previews an unsaved draft with sample data', async () => {
    const { service } = createService();
    const preview = await service.preview(
      { key: 'ticket.message', locale: 'bs', content: { heading: 'Stigla je poruka' } },
      'admin',
    );
    expect(preview.subject).toBe('[HD-2026-000123] Nova poruka: VPN ne radi nakon promjene lozinke');
    expect(preview.html).toContain('Stigla je poruka');
    expect(preview.text).toContain('resetovali smo vaš VPN profil');
    const confidential = await service.preview(
      { key: 'ticket.message', locale: 'bs', confidential: true },
      'admin',
    );
    expect(confidential.text).not.toContain('VPN ne radi');
  });

  it('sends a test only to the signed-in admin and rate-limits it', async () => {
    const { service, sent, auditLogs } = createService();
    await expect(
      service.sendTest({ key: 'ticket.assigned', locale: 'en' }, 'admin'),
    ).resolves.toEqual({ toAddress: 'admin@epbih.ba' });
    expect(sent[0]).toMatchObject({ to: 'admin@epbih.ba', from: 'helpdesk@epbih.ba' });
    expect(sent[0]?.subject.startsWith('[TEST] ')).toBe(true);
    expect(sent[0]?.html).toContain('<!DOCTYPE html>');
    expect(auditLogs[0]).toMatchObject({
      action: 'email_template.test_sent',
      entityId: 'ticket.assigned',
    });
    for (let index = 0; index < 4; index += 1) {
      await service.sendTest({ key: 'ticket.assigned', locale: 'en' }, 'admin');
    }
    await expect(
      service.sendTest({ key: 'ticket.assigned', locale: 'en' }, 'admin'),
    ).rejects.toMatchObject({ code: 'TEST_RATE_LIMITED' });
  });

  it('explains a missing SMTP set-up and surfaces the server answer', async () => {
    const off = createService({ [settingKeys.privateSmtpEnabled]: false });
    await expect(
      off.service.sendTest({ key: 'ticket.created', locale: 'bs' }, 'admin'),
    ).rejects.toMatchObject({ code: 'SMTP_NOT_CONFIGURED' });
    const failing = createService();
    const service = new EmailTemplatesService(
      { ...(failing.service as unknown as { settingsService: SettingsService }).settingsService } as never,
      failing.prisma as never,
      { send: async () => Promise.reject(new Error('535 5.7.3 Authentication unsuccessful')) },
    );
    await expect(
      service.sendTest({ key: 'ticket.created', locale: 'bs' }, 'admin'),
    ).rejects.toMatchObject({ code: 'SMTP_SEND_FAILED', message: expect.stringContaining('535') });
  });
});
