import type { PrismaService } from '../../common/prisma/prisma.service';
import type { SettingsService } from '../settings/settings.service';
import { readInstallAddonsStatus } from './read-install-addons-status';
import { readInstallIdentityStatus } from './read-install-identity-status';
import { readInstallTeamStatus } from './read-install-team-status';
import type { InstallProfile } from './steps/install-step.types';

/**
 * Install wizard v2 (F6.2): what „Sistem je spreman“ says about the installation
 * that was just built. Every number is read from the same source the step that
 * created it reads, so the summary cannot disagree with the wizard.
 */
export type InstallSetupSummary = {
  readonly organizationName: string;
  readonly profile: InstallProfile | null;
  readonly organizationalUnitCount: number;
  readonly serviceCount: number;
  readonly groupCount: number;
  /** Members of the handler group, the founder included. */
  readonly teamMemberCount: number;
  /** Add-ons the installation runs with (the ones the operator left on). */
  readonly enabledAddonKeys: readonly string[];
  /** Steps the operator deferred — the wizard's promise to „configure later“. */
  readonly deferredSteps: readonly string[];
};

export async function readInstallSetupSummary(input: {
  readonly prisma: PrismaService;
  readonly settingsService: SettingsService;
  readonly profile: InstallProfile | null;
  readonly deferredSteps: readonly string[];
}): Promise<InstallSetupSummary> {
  const [identity, addons, team, units, services, groups] = await Promise.all([
    readInstallIdentityStatus(input.settingsService),
    readInstallAddonsStatus(input.settingsService, input.profile),
    readInstallTeamStatus(input.prisma),
    input.prisma.organizationalUnit.findMany({ select: { id: true } }),
    input.prisma.service.findMany({ select: { id: true } }),
    input.prisma.group.findMany({ select: { id: true } }),
  ]);
  return {
    organizationName: identity.organizationName,
    profile: input.profile,
    organizationalUnitCount: units.length,
    serviceCount: services.length,
    groupCount: groups.length,
    teamMemberCount: team.members.length,
    enabledAddonKeys: addons.items.filter((item) => item.enabled).map((item) => item.key),
    deferredSteps: input.deferredSteps,
  };
}
