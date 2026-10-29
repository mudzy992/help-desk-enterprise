import type { PrismaService } from '../../common/prisma/prisma.service';
import { defaultRolePermissionKeys } from '../authorization/authorization.constants';
import { parseAuthenticationMode } from '../authentication/parse-authentication-mode';
import { defaultRoutingConfiguration } from '../routing/routing.constants';
import { resolveTicketRouting } from '../routing/resolve-ticket-routing';
import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import { findInstallFallbackGroup } from './ensure-install-fallback-group';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { findInstallOrganizationalUnit } from './ensure-install-organizational-unit';
import { isSeededServiceUnderActiveSla } from './is-seeded-service-under-active-sla';
import type { InstallReadinessSource } from './evaluate-install-readiness';

const activeServicesProbeLimit = 20;

/**
 * Install wizard v2 (F0.7): binds `evaluate-install-readiness` to the real
 * database and settings registry. Kept apart from the pure function so the
 * rules stay testable without a Prisma client.
 */
export function createInstallReadinessSource(input: {
  readonly prisma: PrismaService;
  readonly settingsService: SettingsService;
}): InstallReadinessSource {
  const { prisma, settingsService } = input;
  const systemRoleKeys = Object.keys(defaultRolePermissionKeys);
  return {
    readSuperAdminExists: async () => (await findInstallSuperAdmin(prisma)) !== null,
    readAuthMode: async () => {
      const saved = await settingsService.hasStoredValue(settingKeys.privateAuthMode);
      if (!saved) {
        return { saved: false, valid: false };
      }
      try {
        parseAuthenticationMode(await settingsService.getSetting(settingKeys.privateAuthMode));
        return { saved: true, valid: true };
      } catch {
        return { saved: true, valid: false };
      }
    },
    readOrganizationalUnitCount: async () =>
      (await prisma.organizationalUnit.findMany({ select: { id: true } })).length,
    readActiveHandlerMemberCount: async () => {
      const fallbackGroup = await findInstallFallbackGroup(prisma);
      if (fallbackGroup === null) {
        return 0;
      }
      return prisma.groupMember.count({
        where: { groupId: fallbackGroup.id, user: { isActive: true } },
      });
    },
    readActiveServiceWithFormCount: async () => {
      const services = await prisma.service.findMany({
        where: { lifecycle: 'ACTIVE' },
        select: { id: true },
        take: activeServicesProbeLimit,
      });
      let withForm = 0;
      for (const service of services) {
        const activeForm = await prisma.formVersion.findFirst({
          where: { serviceId: service.id, status: 'ACTIVE' },
          select: { id: true },
        });
        if (activeForm !== null) {
          withForm += 1;
        }
      }
      return withForm;
    },
    readRoutingOutcome: async () => {
      const [organizationalUnit, services] = await Promise.all([
        findInstallOrganizationalUnit(prisma),
        prisma.service.findMany({
          where: { lifecycle: 'ACTIVE' },
          select: { id: true },
          take: activeServicesProbeLimit,
        }),
      ]);
      const service = services[0];
      if (organizationalUnit === null || service === undefined) {
        return null;
      }
      const resolution = await resolveTicketRouting(
        prisma,
        { originUnitId: organizationalUnit.id, serviceId: service.id },
        defaultRoutingConfiguration,
      ).catch(() => null);
      return resolution?.outcome ?? null;
    },
    readSeededServiceUnderActiveSla: () => isSeededServiceUnderActiveSla(prisma),
    readSystemRoleState: async () => {
      const roles = await Promise.all(
        systemRoleKeys.map((key) =>
          prisma.role.findUnique({ where: { key }, select: { id: true } }),
        ),
      );
      const present = roles.filter((role) => role !== null);
      const hasDefaultPermissions = await hasAnyRolePermission(
        prisma,
        present.map((role) => role.id),
      );
      return {
        rolesPresent: present.length,
        rolesExpected: systemRoleKeys.length,
        hasDefaultPermissions,
      };
    },
  };
}

async function hasAnyRolePermission(
  prisma: PrismaService,
  roleIds: readonly string[],
): Promise<boolean> {
  for (const roleId of roleIds) {
    const links = await prisma.rolePermission.findMany({
      where: { roleId },
      select: { id: true },
      take: 1,
    });
    if (links.length > 0) {
      return true;
    }
  }
  return false;
}
