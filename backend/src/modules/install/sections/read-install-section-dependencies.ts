import type { PrismaService } from '../../../common/prisma/prisma.service';
import { settingKeys } from '../../settings/setting-keys';
import type { SettingsService } from '../../settings/settings.service';
import { readInstallSeedStatus } from '../read-install-seed-status';
import { readInstallTeamStatus } from '../read-install-team-status';
import type { InstallSettingsSectionDependency } from './install-settings-section.registry';
import type { InstallSettingsSectionDependencyStatus } from './install-settings-section.types';

/**
 * Install wizard v2 (F5): „does this section have what it needs?“ — the same
 * question the operator asks. `service` means the structure step created the
 * service tickets can be opened against, `team` means somebody besides the
 * founder can be on call, `directoryLogin` means the sign-in mode actually uses a
 * directory (owner decision 8: the operator states whether AD/LDAPS exists).
 */
export async function readInstallSectionDependencies(
  prisma: PrismaService,
  settingsService: SettingsService,
  dependencies: readonly InstallSettingsSectionDependency[],
): Promise<readonly InstallSettingsSectionDependencyStatus[]> {
  const unique = [...new Set(dependencies)];
  if (unique.length === 0) {
    return [];
  }
  const [seed, team, authMode] = await Promise.all([
    unique.includes('service') ? readInstallSeedStatus(prisma) : null,
    unique.includes('team') ? readInstallTeamStatus(prisma) : null,
    unique.includes('directoryLogin')
      ? settingsService.getSetting(settingKeys.privateAuthMode)
      : null,
  ]);
  return unique.map((dependency) => ({
    dependency,
    satisfied: isDependencySatisfied(dependency, {
      isSeeded: seed?.isSeeded === true,
      isTeamInvited: team?.isTeamInvited === true,
      isDirectoryLogin: authMode === 'entra_ad',
    }),
  }));
}

function isDependencySatisfied(
  dependency: InstallSettingsSectionDependency,
  state: {
    readonly isSeeded: boolean;
    readonly isTeamInvited: boolean;
    readonly isDirectoryLogin: boolean;
  },
): boolean {
  if (dependency === 'service') {
    return state.isSeeded;
  }
  if (dependency === 'team') {
    return state.isTeamInvited;
  }
  return state.isDirectoryLogin;
}
