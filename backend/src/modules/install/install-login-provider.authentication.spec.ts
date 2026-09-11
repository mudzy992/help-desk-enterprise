import { authenticationConstants } from '../authentication/authentication.constants';
import { AuthenticationModeLoader } from '../authentication/authentication-mode.loader';
import { AuthenticationProviderResolver } from '../authentication/authentication-provider.resolver';
import { AuthenticationUserLoader } from '../authentication/authentication-user.loader';
import { EntraAuthenticationConfigurationLoader } from '../authentication/entra-authentication-configuration.loader';
import { EntraAuthenticationProvider } from '../authentication/entra-authentication.provider';
import { hashLocalPassword } from '../authentication/hash-local-password';
import { LocalAuthenticationProvider } from '../authentication/local-authentication.provider';
import { applicationSettings } from '../settings/definitions/application-settings';
import { createInMemorySettingsPrisma } from '../settings/create-in-memory-settings-prisma';
import { createSettingsRegistry } from '../settings/registry/create-settings-registry';
import { SettingsService } from '../settings/settings.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { createInMemoryInstallSuperAdminPrisma } from './create-in-memory-install-super-admin-prisma';
import { createInstallSuperAdmin } from './create-install-super-admin';
import { InstallLoginProviderService } from './install-login-provider.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const password = 'correct-horse-battery';
const tenantId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const entraObjectId = '33333333-3333-3333-3333-333333333333';
const idToken = 'signed.entra.id-token';

describe('Install login provider authentication', () => {
  const users = createInMemoryInstallSuperAdminPrisma();
  const prisma = users.prisma as unknown as PrismaService;
  const settingsMemory = createInMemorySettingsPrisma();
  const settingsService = new SettingsService(
    createSettingsRegistry(applicationSettings),
    settingsMemory.prisma as unknown as PrismaService,
  );
  const installLoginProviderService = new InstallLoginProviderService(
    prisma,
    settingsService,
  );
  const loader = new AuthenticationUserLoader(prisma);
  const localProvider = new LocalAuthenticationProvider(loader);
  const verifyIdToken = jest.fn();
  const entraProvider = new EntraAuthenticationProvider(
    loader,
    new EntraAuthenticationConfigurationLoader(settingsService),
    { verify: verifyIdToken } as never,
  );
  const resolver = new AuthenticationProviderResolver(
    new AuthenticationModeLoader(settingsService),
    localProvider,
    entraProvider,
  );

  beforeAll(async () => {
    users.seedUser({
      id: 'directory-agent',
      email: 'agent@example.com',
      displayName: 'Directory Agent',
      isActive: true,
      isLocalOnly: false,
      localPasswordHash: await hashLocalPassword(password, 4),
      entraObjectId,
    });
    await createInstallSuperAdmin(
      prisma,
      {
        email: 'admin@example.com',
        displayName: 'Super Admin',
        password,
      },
      (value) => hashLocalPassword(value, 4),
    );
  });

  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it('keeps SuperAdmin local break-glass login after entra_ad is selected', async () => {
    await installLoginProviderService.save({
      mode: 'entra_ad',
      azureTenantId: tenantId,
      azureClientId: clientId,
    });
    await expect(resolver.resolve()).resolves.toBe(entraProvider);
    const principal = await entraProvider.authenticate({
      kind: 'password',
      email: 'admin@example.com',
      password,
    });
    expect(principal).toMatchObject({
      email: 'admin@example.com',
      isLocalOnly: true,
    });
    expect(principal).not.toHaveProperty('provider');
    expect(JSON.stringify(principal)).not.toContain(password);
    expect(JSON.stringify(principal)).not.toContain(tenantId);
  });

  it('does not change directory-user entra_ad password rejection or token login', async () => {
    await installLoginProviderService.save({
      mode: 'entra_ad',
      azureTenantId: tenantId,
      azureClientId: clientId,
    });
    await expect(
      entraProvider.authenticate({
        kind: 'password',
        email: 'agent@example.com',
        password,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    verifyIdToken.mockResolvedValue({
      externalSubject: entraObjectId,
      email: 'token-email@example.com',
      displayName: 'Token Display Name',
      tenantId,
    });
    await expect(
      entraProvider.authenticate({ kind: 'entra_id_token', idToken }),
    ).resolves.toEqual({
      subjectId: 'directory-agent',
      email: 'agent@example.com',
      displayName: 'Directory Agent',
      isLocalOnly: false,
    });
    expect(JSON.stringify(verifyIdToken.mock.calls)).not.toContain(password);
  });

  it('keeps local authentication unchanged when local is selected', async () => {
    await installLoginProviderService.save({ mode: 'local' });
    await expect(resolver.resolve()).resolves.toBe(localProvider);
    const principal = await localProvider.authenticate({
      kind: 'password',
      email: 'admin@example.com',
      password,
    });
    expect(principal).toMatchObject({
      email: 'admin@example.com',
      isLocalOnly: true,
    });
    expect(principal).not.toHaveProperty('provider');
    const superAdmin = await loader.findByEmail('admin@example.com');
    expect(superAdmin).toMatchObject({
      isLocalOnly: true,
      entraObjectId: null,
      roleKeys: [authenticationConstants.superAdminRoleKey],
    });
  });
});
