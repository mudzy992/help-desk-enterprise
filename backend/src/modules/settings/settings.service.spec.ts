import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { applicationSettings } from './definitions/application-settings';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { settingKeys } from './setting-keys';
import { SettingsError } from './settings.error';
import { getSettingDefaultValue } from './settings-value';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsService } from './settings.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('SettingsService', () => {
  const findUnique = jest.fn();

  const createService = async (): Promise<SettingsService> => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: SETTINGS_REGISTRY,
          useValue: createSettingsRegistry(applicationSettings),
        },
        {
          provide: PrismaService,
          useValue: { appSetting: { findUnique } },
        },
      ],
    }).compile();
    return moduleRef.get(SettingsService);
  };

  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockResolvedValue(null);
  });

  it('returns only registry-approved public values', async () => {
    const service = await createService();
    const publicSettings = await service.getPublicSettings();
    expect(publicSettings).toEqual({
      [settingKeys.publicBrandingAppName]: 'EP-HelpDesk',
      [settingKeys.publicMaintenanceEnabled]: false,
      [settingKeys.publicMaintenanceMessage]: '',
      [settingKeys.publicMaintenanceFromAt]: '',
      [settingKeys.publicMaintenanceToAt]: '',
      [settingKeys.publicMaintenanceScope]: 'both',
      [settingKeys.publicMaintenanceAffectedServicesCsv]: '',
      [settingKeys.publicMaintenanceIsBlocking]: false,
    });
  });

  it('does not include private or secret keys in public retrieval', async () => {
    findUnique.mockImplementation(({ where }: { where: { key: string } }) => {
      if (where.key === settingKeys.privateInstallCompletedAt) {
        return Promise.resolve({ value: '2026-09-10T00:00:00.000Z' });
      }
      if (where.key === settingKeys.privateAuthJwtSigningSecret) {
        return Promise.resolve({ value: 'plaintext-secret' });
      }
      if (where.key === settingKeys.privateAuthAzureTenantId) {
        return Promise.resolve({ value: 'plaintext-tenant' });
      }
      if (where.key === settingKeys.privateAuthAzureClientId) {
        return Promise.resolve({ value: 'plaintext-client' });
      }
      if (where.key === settingKeys.privateAuthAdBindDn) {
        return Promise.resolve({ value: 'plaintext-bind-dn' });
      }
      if (where.key === settingKeys.privateAuthAdBindPassword) {
        return Promise.resolve({ value: 'plaintext-bind-password' });
      }
      if (where.key === settingKeys.privateSmtpPassword) {
        return Promise.resolve({ value: 'plaintext-smtp-password' });
      }
      return Promise.resolve(null);
    });
    const service = await createService();
    const publicSettings = await service.getPublicSettings();
    expect(publicSettings).not.toHaveProperty(
      settingKeys.privateInstallCompletedAt,
    );
    expect(publicSettings).not.toHaveProperty(
      settingKeys.privateAuthJwtSigningSecret,
    );
    expect(publicSettings).not.toHaveProperty(
      settingKeys.privateAuthAzureTenantId,
    );
    expect(publicSettings).not.toHaveProperty(
      settingKeys.privateAuthAzureClientId,
    );
    expect(JSON.stringify(publicSettings)).not.toContain('plaintext-secret');
    expect(JSON.stringify(publicSettings)).not.toContain('plaintext-tenant');
    expect(JSON.stringify(publicSettings)).not.toContain('plaintext-client');
    expect(JSON.stringify(publicSettings)).not.toContain('plaintext-bind-dn');
    expect(JSON.stringify(publicSettings)).not.toContain(
      'plaintext-bind-password',
    );
    expect(JSON.stringify(publicSettings)).not.toContain(
      'plaintext-smtp-password',
    );
  });

  it('returns private settings without secrets', async () => {
    const service = await createService();
    const privateSettings = await service.getPrivateSettings();
    expect(privateSettings).toEqual(
      Object.fromEntries(
        applicationSettings
          .filter((definition) => definition.visibility === 'private')
          .map((definition) => [
            definition.key,
            getSettingDefaultValue(definition),
          ]),
      ),
    );
    for (const definition of applicationSettings) {
      if (definition.visibility === 'secret') {
        expect(privateSettings).not.toHaveProperty(definition.key);
      }
    }
    expect(privateSettings).toMatchObject({
      [settingKeys.privateAddonsSla]: true,
      [settingKeys.privateAddonsEmail]: false,
      [settingKeys.privateAddonsEdge]: false,
      [settingKeys.privateAddonsTeamsStub]: false,
      [settingKeys.privateAddonsCsat]: true,
      [settingKeys.privateAddonsAutoAssign]: false,
    });
  });

  it('refuses generic secret reads and allows explicit internal secret access', async () => {
    findUnique.mockResolvedValue({ value: 'plaintext-secret' });
    const service = await createService();
    await expect(
      service.getSetting(settingKeys.privateAuthJwtSigningSecret),
    ).rejects.toBeInstanceOf(SettingsError);
    await expect(
      service.getSecretForInternalUse(settingKeys.publicBrandingAppName),
    ).rejects.toBeInstanceOf(SettingsError);
    await expect(
      service.getSecretForInternalUse(settingKeys.privateAuthJwtSigningSecret),
    ).resolves.toBe('plaintext-secret');
  });

  it('treats a missing optional secret as undefined', async () => {
    const service = await createService();
    await expect(
      service.getSecretForInternalUse(settingKeys.privateAuthJwtSigningSecret),
    ).resolves.toBeUndefined();
  });

  it('rejects unknown keys deterministically', async () => {
    const service = await createService();
    await expect(service.getSetting('smtp.host')).rejects.toBeInstanceOf(
      SettingsError,
    );
  });

  it('reads SMTP password only through secret access', async () => {
    findUnique.mockResolvedValue({ value: 'plaintext-smtp-password' });
    const service = await createService();
    await expect(
      service.getSetting(settingKeys.privateSmtpPassword),
    ).rejects.toBeInstanceOf(SettingsError);
    await expect(
      service.getSecretForInternalUse(settingKeys.privateSmtpPassword),
    ).resolves.toBe('plaintext-smtp-password');
  });

  it('reports whether a registry key is stored without changing defaults', async () => {
    const service = await createService();
    await expect(
      service.hasStoredValue(settingKeys.privateSmtpEnabled),
    ).resolves.toBe(false);
    findUnique.mockResolvedValue({ key: settingKeys.privateSmtpEnabled });
    await expect(
      service.hasStoredValue(settingKeys.privateSmtpEnabled),
    ).resolves.toBe(true);
    await expect(service.hasStoredValue('smtp.host')).rejects.toBeInstanceOf(
      SettingsError,
    );
  });
});
