import { redactedSecretPlaceholder } from '../settings/settings.redaction';
import { applicationSettings } from '../settings/definitions/application-settings';
import { createInMemorySettingsPrisma } from '../settings/create-in-memory-settings-prisma';
import { createSettingsRegistry } from '../settings/registry/create-settings-registry';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { hashLocalPassword } from '../authentication/hash-local-password';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { createInMemoryInstallSuperAdminPrisma } from './create-in-memory-install-super-admin-prisma';
import { createInstallSuperAdmin } from './create-install-super-admin';
import { InstallLoginProviderService } from './install-login-provider.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const tenantId = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const bindPassword = 'ldaps-bind-secret-value';
const bindDn = 'CN=svc,OU=Service,DC=epbih,DC=ba';
const ldapsUrls = 'ldaps://dc1.epbih.ba:636, ldaps://dc2.epbih.ba:636';

async function createHarness(withSuperAdmin = true) {
  const users = createInMemoryInstallSuperAdminPrisma();
  const settingsMemory = createInMemorySettingsPrisma();
  const settingsService = new SettingsService(
    createSettingsRegistry(applicationSettings),
    settingsMemory.prisma as unknown as PrismaService,
  );
  const service = new InstallLoginProviderService(
    users.prisma as unknown as PrismaService,
    settingsService,
  );
  if (withSuperAdmin) {
    await createInstallSuperAdmin(
      users.prisma as unknown as PrismaService,
      {
        email: 'admin@example.com',
        displayName: 'Super Admin',
        password: 'correct-horse-battery',
      },
      (value) => hashLocalPassword(value, 4),
    );
  }
  return { service, settingsMemory, settingsService };
}

describe('InstallLoginProviderService', () => {
  it('persists local authentication without requiring AD or Entra fields', async () => {
    const { service, settingsMemory } = await createHarness();
    const saved = await service.save({ mode: 'local' });
    expect(saved).toMatchObject({
      mode: 'local',
      entra: { tenantIdConfigured: false, clientIdConfigured: false },
    });
    expect(settingsMemory.getStored(settingKeys.privateAuthMode)).toMatchObject({
      value: 'local',
      isSecret: false,
    });
    expect(
      settingsMemory.getStored(settingKeys.privateAuthAzureTenantId),
    ).toBeUndefined();
    expect(
      settingsMemory.getStored(settingKeys.privateAuthAdBindPassword),
    ).toBeUndefined();
    expect(JSON.stringify(saved)).not.toContain(tenantId);
    expect(JSON.stringify(saved)).not.toContain(bindPassword);
  });

  it('persists entra_ad tenant and client through secret settings', async () => {
    const { service, settingsMemory } = await createHarness();
    const saved = await service.save({
      mode: 'entra_ad',
      azureTenantId: ` ${tenantId.toUpperCase()} `,
      azureClientId: ` ${clientId.toUpperCase()} `,
    });
    expect(saved).toEqual({
      mode: 'entra_ad',
      entra: { tenantIdConfigured: true, clientIdConfigured: true },
      directoryBind: {
        urls: '',
        bindDnConfigured: false,
        bindPasswordConfigured: false,
      },
    });
    expect(saved).not.toHaveProperty('azureTenantId');
    expect(saved).not.toHaveProperty('azureClientId');
    expect(JSON.stringify(saved)).not.toContain(tenantId);
    expect(JSON.stringify(saved)).not.toContain(clientId);
    expect(
      settingsMemory.getStored(settingKeys.privateAuthAzureTenantId),
    ).toMatchObject({ isSecret: true, value: tenantId });
    expect(
      settingsMemory.getStored(settingKeys.privateAuthAzureClientId),
    ).toMatchObject({ isSecret: true, value: clientId });
    expect(JSON.stringify(settingsMemory.changeLogs)).not.toContain(tenantId);
    expect(JSON.stringify(settingsMemory.changeLogs)).toContain(
      redactedSecretPlaceholder,
    );
  });

  it('accepts entra_ad with a complete LDAPS bind instead of tenant and client', async () => {
    const { service, settingsMemory } = await createHarness();
    const saved = await service.save({
      mode: 'entra_ad',
      adLdapsUrlsCsv: ldapsUrls,
      adBindDn: bindDn,
      adBindPassword: bindPassword,
    });
    expect(saved.mode).toBe('entra_ad');
    expect(saved.directoryBind).toEqual({
      urls: 'ldaps://dc1.epbih.ba:636,ldaps://dc2.epbih.ba:636',
      bindDnConfigured: true,
      bindPasswordConfigured: true,
    });
    expect(JSON.stringify(saved)).not.toContain(bindPassword);
    expect(JSON.stringify(saved)).not.toContain(bindDn);
    expect(
      settingsMemory.getStored(settingKeys.privateAuthAdBindPassword),
    ).toMatchObject({ isSecret: true, value: bindPassword });
    expect(
      settingsMemory.getStored(settingKeys.privateAuthAdBindDn),
    ).toMatchObject({ isSecret: true, value: bindDn });
  });

  it('rejects incomplete or invalid entra_ad configuration before persistence', async () => {
    const { service, settingsMemory } = await createHarness();
    await expect(service.save({ mode: 'entra_ad' })).rejects.toMatchObject({
      response: { code: 'INVALID_LOGIN_PROVIDER_CONFIGURATION' },
    });
    await expect(
      service.save({
        mode: 'entra_ad',
        azureTenantId: tenantId,
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_LOGIN_PROVIDER_CONFIGURATION' },
    });
    await expect(
      service.save({
        mode: 'entra_ad',
        azureTenantId: 'not-a-guid',
        azureClientId: clientId,
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_LOGIN_PROVIDER_CONFIGURATION' },
    });
    await expect(
      service.save({
        mode: 'entra_ad',
        adLdapsUrlsCsv: 'ldap://dc1.epbih.ba:389',
        adBindDn: bindDn,
        adBindPassword: bindPassword,
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_LOGIN_PROVIDER_CONFIGURATION' },
    });
    expect(
      settingsMemory.getStored(settingKeys.privateAuthMode),
    ).toBeUndefined();
    expect(
      settingsMemory.getStored(settingKeys.privateAuthAzureTenantId),
    ).toBeUndefined();
  });

  it('does not expose secrets when reading the saved login provider', async () => {
    const { service } = await createHarness();
    await service.save({
      mode: 'entra_ad',
      azureTenantId: tenantId,
      azureClientId: clientId,
      adLdapsUrlsCsv: ldapsUrls,
      adBindDn: bindDn,
      adBindPassword: bindPassword,
    });
    const status = await service.getStatus();
    const serialized = JSON.stringify(status);
    expect(status.loginProvider.mode).toBe('entra_ad');
    expect(serialized).not.toContain(tenantId);
    expect(serialized).not.toContain(clientId);
    expect(serialized).not.toContain(bindPassword);
    expect(serialized).not.toContain(bindDn);
  });

  it('rejects login provider setup before the SuperAdmin exists', async () => {
    const { service, settingsMemory } = await createHarness(false);
    await expect(
      service.save({
        mode: 'entra_ad',
        azureTenantId: tenantId,
        azureClientId: clientId,
      }),
    ).rejects.toMatchObject({ response: { code: 'SUPER_ADMIN_REQUIRED' } });
    expect(
      settingsMemory.getStored(settingKeys.privateAuthMode),
    ).toBeUndefined();
  });
});
