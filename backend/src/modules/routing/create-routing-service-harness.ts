import { permissionKeys } from '../authorization/authorization.constants';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { defaultRoutingConfiguration } from './routing.constants';
import { createInMemoryRoutingPrisma } from './create-in-memory-routing-prisma';
import { RoutingService } from './routing.service';

export const routingChangeReason =
  'Assign handler group for this origin and service';

/** Viewer that has global routing.read (simulates a fully-authorized admin
 *  used by default in service-level specs that do not exercise auth). */
export const globalRoutingReadViewer: AuthorizationContext = {
  subjectId: 'routing-reader',
  isLocalOnly: false,
  isSuperAdmin: false,
  assignments: [
    {
      roleKey: 'ADMIN',
      permissionKeys: [permissionKeys.routingRead, permissionKeys.routingWrite],
      organizationalUnitId: null,
      organizationalUnitPath: null,
      serviceId: null,
    },
  ],
};

export function createRoutingServiceHarness() {
  const memory = createInMemoryRoutingPrisma();
  const contexts = new Map<string, AuthorizationContext>();
  contexts.set(globalRoutingReadViewer.subjectId, globalRoutingReadViewer);
  const authorizationContextLoader = {
    loadBySubjectId: async (subjectId: string) =>
      contexts.get(subjectId) ?? null,
  };
  const routing = new RoutingService(
    memory.prisma as never,
    {
      load: async () => defaultRoutingConfiguration,
      loadUnroutedTargetGroupId: async () => null,
    } as never,
    authorizationContextLoader as never,
  );
  const viewer = globalRoutingReadViewer;
  const now = new Date('2026-09-11T08:00:00.000Z');
  memory.seedUnit({ id: 'ou-root', parentId: null, ouPath: '/Korisnici' });
  memory.seedUnit({
    id: 'ou-child',
    parentId: 'ou-root',
    ouPath: '/Korisnici/Direkcija',
  });
  memory.seedUnit({
    id: 'ou-leaf',
    parentId: 'ou-child',
    ouPath: '/Korisnici/Direkcija/IT',
  });
  memory.seedService({
    id: 'service-vpn',
    name: 'VPN access',
    lifecycle: 'DRAFT',
    availability: 'OPERATIONAL',
  });
  memory.seedGroup({ id: 'group-it', name: 'IT Support' });
  memory.seedGroup({ id: 'group-net', name: 'Network Ops' });
  return { memory, routing, viewer, now };
}
