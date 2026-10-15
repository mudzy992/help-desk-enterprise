import type { PrismaService } from '../../common/prisma/prisma.service';
import { hashLocalPassword } from '../authentication/hash-local-password';
import { applicationSettings } from '../settings/definitions/application-settings';
import { createInMemorySettingsPrisma } from '../settings/create-in-memory-settings-prisma';
import { createSettingsRegistry } from '../settings/registry/create-settings-registry';
import { SettingsService } from '../settings/settings.service';
import { createInMemoryInstallSuperAdminPrisma } from './create-in-memory-install-super-admin-prisma';
import { createInstallSuperAdmin } from './create-install-super-admin';
import { InstallCompleteService } from './install-complete.service';
import type { InstallReadinessResult } from './evaluate-install-readiness';
import { InstallSetupService } from './install-setup.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

export type ReadinessStub = {
  check: () => Promise<InstallReadinessResult>;
};

async function defaultReadiness(): Promise<InstallReadinessResult> {
  return createReadinessResult();
}

export function createReadinessResult(
  checks: InstallReadinessResult['checks'] = [],
): InstallReadinessResult {
  return {
    isReady: checks.every((entry) => entry.status !== 'missing'),
    checks,
  };
}

/**
 * The complete service now reads readiness (F0.7), so every harness gets a stub
 * that reports "ready" by default and lets a spec flip individual checks.
 */
export async function createInstallCompleteHarness(input?: {
  readonly withSuperAdmin?: boolean;
  readonly readiness?: () => Promise<InstallReadinessResult>;
}) {
  const users = createInMemoryInstallSuperAdminPrisma();
  const settingsMemory = createInMemorySettingsPrisma();
  const prisma = {
    user: users.prisma.user,
    appSetting: settingsMemory.prisma.appSetting,
    changeLog: settingsMemory.prisma.changeLog,
    $transaction: settingsMemory.prisma.$transaction,
  };
  const registry = createSettingsRegistry(applicationSettings);
  const settingsService = new SettingsService(
    registry,
    settingsMemory.prisma as unknown as PrismaService,
  );
  if (input?.withSuperAdmin !== false) {
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
  return {
    users,
    settingsMemory,
    settingsService,
    setupService: new InstallSetupService(
      settingsService,
      prisma as unknown as PrismaService,
    ),
    completeService: new InstallCompleteService(
      prisma as unknown as PrismaService,
      registry,
      settingsService,
      {
        check: input?.readiness ?? defaultReadiness,
      } as never,
    ),
  };
}
