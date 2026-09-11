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
import { InstallSmtpService } from './install-smtp.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const smtpPassword = 'smtp-secret-value';
const mutation = { reason: 'install_wizard', actorUserId: 'seed' };
const completeOn = {
  enabled: true as const,
  host: 'smtp.example.com',
  port: 587,
  tls: true,
  username: 'helpdesk',
  password: smtpPassword,
  fromAddress: 'noreply@example.com',
};

async function createHarness(withSuperAdmin = true) {
  const users = createInMemoryInstallSuperAdminPrisma();
  const settingsMemory = createInMemorySettingsPrisma();
  const settingsService = new SettingsService(
    createSettingsRegistry(applicationSettings),
    settingsMemory.prisma as unknown as PrismaService,
  );
  const service = new InstallSmtpService(
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

describe('InstallSmtpService', () => {
  it('persists SMTP off and forcibly disables the email addon', async () => {
    const { service, settingsMemory, settingsService } = await createHarness();
    await settingsService.setSettingValue(
      settingKeys.privateAddonsEmail,
      true,
      mutation,
    );
    const saved = await service.save({ enabled: false });
    expect(saved).toMatchObject({
      isConfigured: true,
      enabled: false,
      emailAddonEnabled: false,
    });
    expect(JSON.stringify(saved)).not.toContain(smtpPassword);
    expect(settingsMemory.getStored(settingKeys.privateSmtpEnabled)).toMatchObject({
      value: false,
      isSecret: false,
    });
    expect(settingsMemory.getStored(settingKeys.privateAddonsEmail)).toMatchObject({
      value: false,
    });
    expect(
      settingsMemory.getStored(settingKeys.privateSmtpPassword),
    ).toBeUndefined();
  });

  it('persists SMTP on through the settings registry and redacts the password', async () => {
    const { service, settingsMemory } = await createHarness();
    const saved = await service.save(completeOn);
    expect(saved).toEqual({
      isConfigured: true,
      enabled: true,
      host: 'smtp.example.com',
      port: 587,
      tls: true,
      username: 'helpdesk',
      fromAddress: 'noreply@example.com',
      passwordConfigured: true,
      emailAddonEnabled: false,
    });
    expect(saved).not.toHaveProperty('password');
    expect(JSON.stringify(saved)).not.toContain(smtpPassword);
    expect(
      settingsMemory.getStored(settingKeys.privateSmtpPassword),
    ).toMatchObject({ isSecret: true, value: smtpPassword });
    expect(JSON.stringify(settingsMemory.changeLogs)).not.toContain(smtpPassword);
    expect(JSON.stringify(settingsMemory.changeLogs)).toContain(
      redactedSecretPlaceholder,
    );
  });

  it('rejects incomplete SMTP on configuration before persistence', async () => {
    const { service, settingsMemory } = await createHarness();
    await expect(service.save({ enabled: true })).rejects.toMatchObject({
      response: { code: 'INVALID_SMTP_CONFIGURATION' },
    });
    await expect(
      service.save({ ...completeOn, fromAddress: 'not-an-email' }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_SMTP_CONFIGURATION' },
    });
    expect(
      settingsMemory.getStored(settingKeys.privateSmtpEnabled),
    ).toBeUndefined();
    expect(
      settingsMemory.getStored(settingKeys.privateSmtpPassword),
    ).toBeUndefined();
  });

  it('does not enable the email addon when SMTP is turned on', async () => {
    const { service, settingsMemory } = await createHarness();
    const saved = await service.save(completeOn);
    expect(saved.emailAddonEnabled).toBe(false);
    expect(settingsMemory.getStored(settingKeys.privateAddonsEmail)).toBeUndefined();
  });

  it('keeps a stored email addon enabled only while SMTP stays on', async () => {
    const { service, settingsMemory, settingsService } = await createHarness();
    await settingsService.setSettingValue(
      settingKeys.privateAddonsEmail,
      true,
      mutation,
    );
    await expect(service.save(completeOn)).resolves.toMatchObject({
      enabled: true,
      emailAddonEnabled: true,
    });
    await expect(service.save({ enabled: false })).resolves.toMatchObject({
      enabled: false,
      emailAddonEnabled: false,
    });
    expect(settingsMemory.getStored(settingKeys.privateAddonsEmail)).toMatchObject({
      value: false,
    });
  });

  it('leaves unrelated settings unchanged after SMTP save', async () => {
    const { service, settingsService } = await createHarness();
    const brandingBefore = await settingsService.getSetting(
      settingKeys.publicBrandingAppName,
    );
    const authModeBefore = await settingsService.getSetting(
      settingKeys.privateAuthMode,
    );
    await service.save(completeOn);
    await expect(
      settingsService.getSetting(settingKeys.publicBrandingAppName),
    ).resolves.toBe(brandingBefore);
    await expect(
      settingsService.getSetting(settingKeys.privateAuthMode),
    ).resolves.toBe(authModeBefore);
  });

  it('rejects SMTP setup before the SuperAdmin exists', async () => {
    const { service, settingsMemory } = await createHarness(false);
    await expect(service.save(completeOn)).rejects.toMatchObject({
      response: { code: 'SUPER_ADMIN_REQUIRED' },
    });
    expect(
      settingsMemory.getStored(settingKeys.privateSmtpEnabled),
    ).toBeUndefined();
  });
});
