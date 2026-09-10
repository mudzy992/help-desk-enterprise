import { AuthenticationError } from './authentication.error';
import { AuthenticationProviderResolver } from './authentication-provider.resolver';
import type { AuthenticationMode } from './authentication.types';
import { EntraAuthenticationProvider } from './entra-authentication.provider';
import { LocalAuthenticationProvider } from './local-authentication.provider';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('AuthenticationProviderResolver', () => {
  const load = jest.fn<Promise<AuthenticationMode>, []>();
  const localAuthenticationProvider = { authenticate: jest.fn() };
  const entraAuthenticationProvider = { authenticate: jest.fn() };
  const resolver = new AuthenticationProviderResolver(
    { load } as never,
    localAuthenticationProvider as unknown as LocalAuthenticationProvider,
    entraAuthenticationProvider as unknown as EntraAuthenticationProvider,
  );

  beforeEach(() => {
    load.mockReset();
  });

  it('selects the local provider from settings without leaking the mode downstream', async () => {
    load.mockResolvedValue('local');
    await expect(resolver.resolve()).resolves.toBe(localAuthenticationProvider);
  });

  it('selects the entra provider from settings', async () => {
    load.mockResolvedValue('entra_ad');
    await expect(resolver.resolve()).resolves.toBe(entraAuthenticationProvider);
  });

  it('fails closed when the mode loader rejects unsupported configuration', async () => {
    load.mockRejectedValue(
      new AuthenticationError('UNSUPPORTED_AUTHENTICATION_MODE'),
    );
    await expect(resolver.resolve()).rejects.toMatchObject({
      code: 'UNSUPPORTED_AUTHENTICATION_MODE',
    });
  });
});
