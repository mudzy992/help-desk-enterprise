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

export function createPolicyPackTestWorld(): {
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
    service: new PolicyPacksService(memory.prisma as never),
  };
}
