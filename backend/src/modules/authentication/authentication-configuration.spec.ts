import { SettingsError } from '../settings/settings.error';
import { settingKeys } from '../settings/setting-keys';
import { AuthenticationError } from './authentication.error';
import { AuthenticationModeLoader } from './authentication-mode.loader';
import { EntraAuthenticationConfigurationLoader } from './entra-authentication-configuration.loader';
import { JwtSigningSecretLoader } from './jwt-signing-secret.loader';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('AuthenticationModeLoader', () => {
  const getSetting = jest.fn();
  const loader = new AuthenticationModeLoader({ getSetting } as never);

  beforeEach(() => {
    getSetting.mockReset();
  });

  it('loads local and entra_ad from the existing settings key', async () => {
    getSetting.mockResolvedValue('local');
    await expect(loader.load()).resolves.toBe('local');
    expect(getSetting).toHaveBeenCalledWith(settingKeys.privateAuthMode);
    getSetting.mockResolvedValue('entra_ad');
    await expect(loader.load()).resolves.toBe('entra_ad');
  });

  it('fails closed for invalid stored values', async () => {
    getSetting.mockResolvedValue('test');
    await expect(loader.load()).rejects.toMatchObject({
      code: 'UNSUPPORTED_AUTHENTICATION_MODE',
    });
    getSetting.mockRejectedValue(new SettingsError('invalid'));
    await expect(loader.load()).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe('JwtSigningSecretLoader', () => {
  const getSecretForInternalUse = jest.fn();
  const loader = new JwtSigningSecretLoader({
    getSecretForInternalUse,
  } as never);

  beforeEach(() => {
    getSecretForInternalUse.mockReset();
  });

  it('returns a configured signing secret', async () => {
    getSecretForInternalUse.mockResolvedValue(
      'unit-test-jwt-signing-secret-value!',
    );
    await expect(loader.load()).resolves.toBe(
      'unit-test-jwt-signing-secret-value!',
    );
    expect(getSecretForInternalUse).toHaveBeenCalledWith(
      settingKeys.privateAuthJwtSigningSecret,
    );
  });

  it('fails closed when the secret is missing or too short', async () => {
    getSecretForInternalUse.mockResolvedValue(undefined);
    await expect(loader.load()).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });
    getSecretForInternalUse.mockResolvedValue('short');
    await expect(loader.load()).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });
  });
});

describe('EntraAuthenticationConfigurationLoader', () => {
  const getSecretForInternalUse = jest.fn();
  const loader = new EntraAuthenticationConfigurationLoader({
    getSecretForInternalUse,
  } as never);
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const clientId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    getSecretForInternalUse.mockReset();
    getSecretForInternalUse.mockImplementation((key: string) => {
      if (key === settingKeys.privateAuthAzureTenantId) {
        return Promise.resolve(tenantId);
      }
      if (key === settingKeys.privateAuthAzureClientId) {
        return Promise.resolve(clientId);
      }
      return Promise.resolve(undefined);
    });
  });

  it('loads tenant and client identifiers from settings secrets', async () => {
    await expect(loader.load()).resolves.toEqual({
      tenantId,
      clientId,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      jwksUrl: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
    });
    expect(getSecretForInternalUse).toHaveBeenCalledWith(
      settingKeys.privateAuthAzureTenantId,
    );
    expect(getSecretForInternalUse).toHaveBeenCalledWith(
      settingKeys.privateAuthAzureClientId,
    );
  });

  it('fails closed when Entra settings are missing', async () => {
    getSecretForInternalUse.mockResolvedValue(undefined);
    await expect(loader.load()).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });
    getSecretForInternalUse.mockRejectedValue(new SettingsError('denied'));
    await expect(loader.load()).rejects.toMatchObject({
      code: 'AUTHENTICATION_UNAVAILABLE',
    });
  });
});
