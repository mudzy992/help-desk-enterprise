import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import { loadInboundEmailConfiguration } from './inbound-email-configuration';

describe('loadInboundEmailConfiguration', () => {
  it('reads secrets through getSecretForInternalUse (getSetting rejects them)', async () => {
    const secrets: Record<string, string> = {
      [settingKeys.privateInboundImapPassword]: 'abcdabcdabcdabcd',
      [settingKeys.privateInboundGraphClientSecret]: 'graph-secret',
    };
    const settings = {
      getSetting: jest.fn(async (key: string) => {
        if (key in secrets) throw new Error(`Secret setting ${key} must be read via getSecretForInternalUse`);
        return key === settingKeys.privateInboundProvider ? 'imap' : undefined;
      }),
      getSecretForInternalUse: jest.fn(async (key: string) => secrets[key]),
    } as unknown as SettingsService;
    const configuration = await loadInboundEmailConfiguration(settings);
    expect(configuration.imap.password).toBe('abcdabcdabcdabcd');
    expect(configuration.graph.clientSecret).toBe('graph-secret');
    expect(configuration.trustedAuthservId).toBe('');
  });

  it('loads the configured receiving authserv-id as a non-secret setting', async () => {
    const settings = {
      getSetting: jest.fn(async (key: string) => {
        if (key === settingKeys.privateInboundProvider) return 'imap';
        if (key === settingKeys.privateInboundTrustedAuthservId) return 'mx.example.com';
        return undefined;
      }),
      getSecretForInternalUse: jest.fn(async () => undefined),
    } as unknown as SettingsService;
    const configuration = await loadInboundEmailConfiguration(settings);
    expect(configuration.trustedAuthservId).toBe('mx.example.com');
  });
});
