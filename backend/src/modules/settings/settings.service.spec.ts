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
    expect(privateSettings).toEqual({
      [settingKeys.privateInstallCompletedAt]: '',
      [settingKeys.privateAuthMode]: 'local',
      [settingKeys.privateAuthAdLdapsUrlsCsv]: '',
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
      [settingKeys.privateChangeLogSettingsEnabled]: true,
      [settingKeys.privateChangeLogRoutingEnabled]: true,
      [settingKeys.privateChangeLogIncludeDiff]: true,
      [settingKeys.privateChangeLogRequireReason]: true,
      [settingKeys.privateSmtpEnabled]: false,
      [settingKeys.privateSmtpHost]: '',
      [settingKeys.privateSmtpPort]: 587,
      [settingKeys.privateSmtpTls]: true,
      [settingKeys.privateSmtpUsername]: '',
      [settingKeys.privateSmtpFromAddress]: '',
      [settingKeys.privateAddonsEmail]: false,
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
    expect(privateSettings).not.toHaveProperty(settingKeys.privateAuthAdBindDn);
    expect(privateSettings).not.toHaveProperty(
      settingKeys.privateAuthAdBindPassword,
    );
    expect(privateSettings).not.toHaveProperty(settingKeys.privateSmtpPassword);
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
