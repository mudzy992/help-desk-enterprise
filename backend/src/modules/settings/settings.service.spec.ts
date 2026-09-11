import { Test } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { applicationSettings } from './definitions/application-settings';
import { createSettingsRegistry } from './registry/create-settings-registry';
import { settingKeys } from './setting-keys';
import { SettingsError } from './settings.error';
import { SETTINGS_REGISTRY } from './settings.registry-token';
import { SettingsService } from './settings.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('SettingsService', () => {
  const findUnique = jest.fn();
  const upsert = jest.fn();

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
          useValue: { appSetting: { findUnique, upsert } },
        },
      ],
    }).compile();
    return moduleRef.get(SettingsService);
  };

  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
    findUnique.mockResolvedValue(null);
    upsert.mockResolvedValue({});
  });

  it('returns only registry-approved public values', async () => {
    const service = await createService();
    const publicSettings = await service.getPublicSettings();
    expect(publicSettings).toEqual({
      [settingKeys.publicBrandingAppName]: 'EP-HelpDesk',
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
  });

  it('returns private settings without secrets', async () => {
    const service = await createService();
    const privateSettings = await service.getPrivateSettings();
    expect(privateSettings).toEqual({
      [settingKeys.privateInstallCompletedAt]: '',
      [settingKeys.privateAuthMode]: 'local',
      [settingKeys.privateAuthAdReadEnabled]: false,
      [settingKeys.privateAuthAdReadStrategy]: 'manual_only',
      [settingKeys.privateAuthAdReadUsersBaseDn]: '',
      [settingKeys.privateAuthAdReadGroupsBaseDn]: '',
      [settingKeys.privateAuthAdReadMaxQueriesPerSecond]: 0.5,
      [settingKeys.privateAuthAdReadCacheTtlMinutes]: 30,
      [settingKeys.privateAuthAdReadOuTreeCacheTtlHours]: 12,
      [settingKeys.privateReadOnlyModeEnabled]: true,
      [settingKeys.privateReadOnlyModeModulesCsv]:
        'admin,settings,routing,service_catalog,service_forms,sla',
      [settingKeys.privateReadOnlyModeActiveModulesCsv]: '',
      [settingKeys.privateReadOnlyModeBypassRolesCsv]: 'SUPER_ADMIN',
      [settingKeys.privateServicesLifecycleEnabled]: true,
      [settingKeys.privateServicesLifecycleAllowedStatesCsv]:
        'DRAFT,ACTIVE,DEPRECATED',
      [settingKeys.privateServicesLifecycleDefaultStateOnCreate]: 'DRAFT',
      [settingKeys.privateServicesAvailabilityEnabled]: true,
      [settingKeys.privateServicesAvailabilityAllowedStatusesCsv]:
        'OPERATIONAL,DEGRADED,DOWN,MAINTENANCE',
      [settingKeys.privateServicesAvailabilityShowStatusInCatalog]: true,
      [settingKeys.privateServicesAvailabilityShowStatusInTicketCreate]: true,
      [settingKeys.privateServicesAvailabilityChangeRequiresReason]: true,
      [settingKeys.privateServicesDowntimeSchedulingEnabled]: true,
      [settingKeys.privateServicesDowntimeSchedulingAutoSetMaintenanceStatus]: true,
      [settingKeys.privateServicesDowntimeSchedulingAutoRestoreOperational]: true,
      [settingKeys.privateServicesDowntimeSchedulingRequireReason]: true,
      [settingKeys.privateTicketFormsEnabled]: true,
      [settingKeys.privateTicketFormsRequireStructuredFields]: true,
      [settingKeys.privateTicketFormsVersioningEnabled]: true,
      [settingKeys.privateTicketFormsVersioningAllowMultipleActiveVersions]: false,
      [settingKeys.privateTicketFormsVersioningRequireVersionOnTicket]: true,
      [settingKeys.privateServicesOnboardingWizardEnabled]: true,
      [settingKeys.privateServicesOnboardingWizardRequireValidationBeforeActivate]:
        true,
      [settingKeys.privateServicesOnboardingWizardAutoFillRoutingEnabled]: true,
      [settingKeys.privateServicesOnboardingWizardAutoFillRoutingRequireConfirm]:
        true,
      [settingKeys.privateTicketUnroutedQueueEnabled]: true,
      [settingKeys.privateTicketUnroutedQueueOwnerRole]: 'SUPER_ADMIN',
    });
    expect(privateSettings).not.toHaveProperty(
      settingKeys.privateAuthJwtSigningSecret,
    );
    expect(privateSettings).not.toHaveProperty(
      settingKeys.privateAuthAzureTenantId,
    );
    expect(privateSettings).not.toHaveProperty(
      settingKeys.privateAuthAzureClientId,
    );
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

  it('persists secrets as private+isSecret without leaking plaintext in errors', async () => {
    findUnique.mockResolvedValue({ value: 'plaintext-secret' });
    const service = await createService();
    await service.setSettingValue(
      settingKeys.privateAuthJwtSigningSecret,
      'plaintext-secret',
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          isSecret: true,
          value: 'plaintext-secret',
        }),
      }),
    );
    const deniedRead = await service
      .getSetting(settingKeys.privateAuthJwtSigningSecret)
      .catch((error: unknown) => error);
    expect(deniedRead).toBeInstanceOf(SettingsError);
    if (!(deniedRead instanceof SettingsError)) {
      throw new Error('expected SettingsError');
    }
    expect(deniedRead.message).toMatch(/getSecretForInternalUse/);
    expect(deniedRead.message).not.toContain('plaintext-secret');
  });
});
