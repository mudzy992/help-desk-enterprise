import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import { loadEmailChannelConfiguration, readPublicAppUrl } from './load-email-channel-configuration';

function settings(values: Record<string, unknown>): SettingsService {
  return {
    getSetting: async (key: string) => values[key],
    getSecretForInternalUse: async () => 'secret',
  } as unknown as SettingsService;
}

const base = {
  [settingKeys.privateSmtpEnabled]: true,
  [settingKeys.privateSmtpFromAddress]: 'helpdesk@epbih.ba',
  [settingKeys.privateSmtpPort]: 2525,
  [settingKeys.privateSmtpTls]: false,
};

describe('loadEmailChannelConfiguration — provider (E10)', () => {
  it('fills host, port and TLS from the O365 preset while the host is empty', async () => {
    const configuration = await loadEmailChannelConfiguration(
      settings({ ...base, [settingKeys.privateSmtpProvider]: 'o365' }),
    );
    expect(configuration.smtp).toMatchObject({
      host: 'smtp.office365.com',
      port: 587,
      tls: true,
      provider: 'o365',
    });
  });

  it('uses the Gmail preset', async () => {
    const configuration = await loadEmailChannelConfiguration(
      settings({ ...base, [settingKeys.privateSmtpProvider]: 'gmail' }),
    );
    expect(configuration.smtp).toMatchObject({ host: 'smtp.gmail.com', port: 587, tls: true });
  });

  it('lets a typed host win over the preset', async () => {
    const configuration = await loadEmailChannelConfiguration(
      settings({
        ...base,
        [settingKeys.privateSmtpProvider]: 'o365',
        [settingKeys.privateSmtpHost]: 'mail.epbih.ba',
      }),
    );
    expect(configuration.smtp).toMatchObject({ host: 'mail.epbih.ba', port: 2525, tls: false });
  });

  it('needs a host for the custom provider', async () => {
    const configuration = await loadEmailChannelConfiguration(
      settings({ ...base, [settingKeys.privateSmtpProvider]: 'smtp' }),
    );
    expect(configuration.smtp).toBeNull();
  });
});

describe('loadEmailChannelConfiguration — presentation', () => {
  it('defaults to no-reply, bs, excerpt on', async () => {
    const { presentation } = await loadEmailChannelConfiguration(settings(base));
    expect(presentation).toMatchObject({
      replyMode: 'no_reply',
      replyToAddress: null,
      includeMessageExcerpt: true,
      defaultLocale: 'bs',
      supportedLocales: ['bs', 'en'],
      appName: 'EP-HelpDesk',
      accentColor: '#4f46e5',
    });
  });

  it('falls back to no-reply when the shared mailbox has no address (E8)', async () => {
    const { presentation } = await loadEmailChannelConfiguration(
      settings({ ...base, [settingKeys.privateNotificationsEmailReplyMode]: 'shared_mailbox' }),
    );
    expect(presentation.configuredReplyMode).toBe('shared_mailbox');
    expect(presentation.replyMode).toBe('no_reply');
  });

  it('enables Reply-To with a shared mailbox address', async () => {
    const { presentation } = await loadEmailChannelConfiguration(
      settings({
        ...base,
        [settingKeys.privateNotificationsEmailReplyMode]: 'shared_mailbox',
        [settingKeys.privateNotificationsEmailReplyToAddress]: 'podrska@epbih.ba',
      }),
    );
    expect(presentation).toMatchObject({
      replyMode: 'shared_mailbox',
      replyToAddress: 'podrska@epbih.ba',
    });
  });
});

describe('readPublicAppUrl', () => {
  const original = process.env.APP_PUBLIC_URL;
  afterEach(() => {
    process.env.APP_PUBLIC_URL = original;
  });

  it('normalises the URL and rejects anything that is not http(s)', () => {
    process.env.APP_PUBLIC_URL = 'https://desk.epbih.ba/';
    expect(readPublicAppUrl()).toBe('https://desk.epbih.ba');
    process.env.APP_PUBLIC_URL = 'javascript:alert(1)';
    expect(readPublicAppUrl()).toBeNull();
    process.env.APP_PUBLIC_URL = '';
    expect(readPublicAppUrl()).toBeNull();
  });
});
