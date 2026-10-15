import type { PrismaService } from '../../common/prisma/prisma.service';
import { hashLocalPassword } from '../authentication/hash-local-password';
import { defaultRoutingConfiguration } from '../routing/routing.constants';
import { defaultServiceFormsConfiguration } from '../service-catalog/service-forms.constants';
import { defaultServiceLifecycleConfiguration } from '../service-catalog/service-catalog.constants';
import { applicationSettings } from '../settings/definitions/application-settings';
import { createInMemorySettingsPrisma } from '../settings/create-in-memory-settings-prisma';
import { createSettingsRegistry } from '../settings/registry/create-settings-registry';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import { createInMemoryInstallSeedPrisma } from './create-in-memory-install-seed-prisma';
import { createInstallSuperAdmin } from './create-install-super-admin';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { InstallAddonsService } from './install-addons.service';
import { InstallIdentityService } from './install-identity.service';
import { InstallTeamService } from './install-team.service';
import { InstallProfileService } from './install-profile.service';
import { InstallSeedService } from './install-seed.service';
import { InstallReadinessService } from './install-readiness.service';
import { InstallSetupService } from './install-setup.service';
import { InstallStepSkipService } from './install-step-skip.service';
import { RoutingConfigurationLoader } from '../routing/routing-configuration.loader';
import { ServiceFormsConfigurationLoader } from '../service-catalog/service-forms-configuration.loader';
import { ServiceLifecycleConfigurationLoader } from '../service-catalog/service-lifecycle-configuration.loader';
import { seedInstallMinimum } from './seed-install-minimum';

/**
 * Install wizard v2 (F1): every wizard service reads the same three things — the
 * step registry, the settings service and the seeded records. This harness wires
 * them over the existing in-memory doubles so the package, skip, readiness and
 * status specs exercise real code paths instead of stubbing each reader.
 */
export async function createInstallWizardHarness(input?: {
  readonly withSuperAdmin?: boolean;
}) {
  const memory = createInMemoryInstallSeedPrisma();
  const settingsMemory = createInMemorySettingsPrisma();
  const prisma = {
    ...memory.prisma,
    appSetting: settingsMemory.prisma.appSetting,
    // The wizard logs its settings changes; keeping them next to the settings
    // double lets a spec assert on the same history the API would report.
    changeLog: settingsMemory.prisma.changeLog,
  } as unknown as PrismaService;
  /**
   * The seed store rolls the wizard records back by itself, but its transaction
   * hands the callback the unmerged client — the wizard also writes settings
   * inside transactions (`InstallProfileService`), so the merged client is passed
   * through instead. Settings writes are not rolled back here; the real database
   * transaction covers both.
   */
  (prisma as { $transaction: unknown }).$transaction = (
    callback: (client: unknown) => Promise<unknown>,
  ) => memory.prisma.$transaction(() => callback(prisma));
  const registry = createSettingsRegistry(applicationSettings);
  const settingsService = new SettingsService(
    registry,
    settingsMemory.prisma as unknown as PrismaService,
  );
  if (input?.withSuperAdmin !== false) {
    await createInstallSuperAdmin(
      memory.prisma as unknown as PrismaService,
      {
        email: 'admin@example.com',
        displayName: 'Super Admin',
        password: 'correct-horse-battery',
      },
      (value) => hashLocalPassword(value, 4),
    );
  }
  const actorUserId = (await findInstallSuperAdmin(prisma))?.id ?? 'super-admin';
  return {
    memory,
    settingsMemory,
    prisma,
    registry,
    settingsService,
    actorUserId,
    profileService: new InstallProfileService(prisma, settingsService, registry),
    skipService: new InstallStepSkipService(prisma, settingsService),
    readinessService: new InstallReadinessService(prisma, settingsService),
    setupService: new InstallSetupService(settingsService, prisma),
    addonsService: new InstallAddonsService(prisma, settingsService),
    identityService: new InstallIdentityService(prisma, settingsService),
    // The team step only reaches the mail transport when SMTP is configured; a
    // spec that wants delivery asserted passes its own transport instead.
    teamService: new InstallTeamService(
      prisma,
      settingsService,
      { send: async () => {} },
    ),
    /**
     * The real `POST /install/seed` service. The configuration loaders read the
     * settings registry; a spec that does not change those settings gets the
     * shipped defaults, exactly like a fresh installation.
     */
    seedService: new InstallSeedService(
      prisma,
      new ServiceLifecycleConfigurationLoader(settingsService),
      new RoutingConfigurationLoader(settingsService),
      new ServiceFormsConfigurationLoader(settingsService),
    ),
    /** Runs the real minimum seed, exactly like `POST /install/seed`. */
    seedMinimum: (actor = actorUserId) =>
      seedInstallMinimum(prisma, {
        actorUserId: actor,
        lifecycle: defaultServiceLifecycleConfiguration,
        routing: defaultRoutingConfiguration,
        forms: defaultServiceFormsConfiguration,
      }),
    /** Marks SMTP as answered, like `POST /install/smtp`. */
    saveSmtp: async () => {
      // `private.smtp.enabled` depends on a host, exactly like the real form.
      await settingsService.setSettingValue(
        settingKeys.privateSmtpHost,
        'smtp.example.com',
        { reason: 'install_smtp', actorUserId },
      );
      await settingsService.setSettingValue(
        settingKeys.privateSmtpEnabled,
        true,
        { reason: 'install_smtp', actorUserId },
      );
    },
    /** Marks the identity step as answered, like `POST /install/identity`. */
    saveIdentity: () =>
      settingsService.setSettingValue(
        settingKeys.publicBrandingOrganizationName,
        'Visoko Grad',
        { reason: 'install_identity', actorUserId },
      ),
    /** Marks the login mode as answered, like `POST /install/login-provider`. */
    saveAuthMode: (mode: 'local' | 'entra') =>
      settingsService.setSettingValue(settingKeys.privateAuthMode, mode, {
        reason: 'install_login_provider',
        actorUserId,
      }),
    readStored: (key: string) => settingsMemory.getStored(key),
  };
}
