import type { SettingsService } from '../settings/settings.service';
import { createInMemoryPolicyPackPrisma } from './create-in-memory-policy-pack-prisma';
import { PolicyPacksService } from './policy-packs.service';

export const policyPackTestIds = {
  organizationalUnit: 'ou-it',
  siblingOrganizationalUnit: 'ou-hr',
  service: 'service-it',
  otherService: 'service-hr',
  localUser: 'user-local',
  entraUser: 'user-entra',
} as const;

export function createPolicyPackTestWorld(
  options: {
    /**
     * Phase 2.2: lets a test observe the authorization cache invalidations that
     * a policy pack apply triggers for the users it granted roles to.
     */
    readonly invalidateUser?: (userId: string) => Promise<unknown>;
    /**
     * M5 B2 (val 5): the disabled-packs setting is read through
     * `SettingsService`; tests that exercise it pass a stub here.
     */
    readonly settingValues?: Readonly<Record<string, string>>;
  } = {},
): {
  memory: ReturnType<typeof createInMemoryPolicyPackPrisma>;
  service: PolicyPacksService;
} {
  const memory = createInMemoryPolicyPackPrisma();
  memory.seedOrganizationalUnit({
    id: policyPackTestIds.organizationalUnit,
    ouPath: '/Korisnici/IT',
    policyPackId: null,
  });
  memory.seedOrganizationalUnit({
    id: policyPackTestIds.siblingOrganizationalUnit,
    ouPath: '/Korisnici/HR',
    policyPackId: null,
  });
  memory.seedService({
    id: policyPackTestIds.service,
    policyPackId: null,
  });
  memory.seedService({
    id: policyPackTestIds.otherService,
    policyPackId: null,
  });
  memory.seedUser({
    id: policyPackTestIds.localUser,
    isActive: true,
    isLocalOnly: true,
    entraObjectId: null,
  });
  memory.seedUser({
    id: policyPackTestIds.entraUser,
    isActive: true,
    isLocalOnly: false,
    entraObjectId: 'entra-object-1',
  });
  return {
    memory,
    service: new PolicyPacksService(
      memory.prisma as never,
      options.invalidateUser === undefined
        ? undefined
        : ({ invalidateUser: options.invalidateUser } as never),
      options.settingValues === undefined
        ? undefined
        : ({
            getSecretForInternalUse: async (key: string) =>
              options.settingValues?.[key],
          } as unknown as SettingsService),
    ),
  };
}
