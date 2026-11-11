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
    /** Observe the batched invalidation after pack grant or catalogue changes. */
    readonly invalidateUsers?: (userIds: readonly string[]) => Promise<unknown>;
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
      options.invalidateUsers === undefined
        ? undefined
        : ({ invalidateUsers: options.invalidateUsers } as never),
      options.settingValues === undefined
        ? undefined
        : ({
            getSecretForInternalUse: async (key: string) =>
              options.settingValues?.[key],
          } as unknown as SettingsService),
    ),
  };
}
