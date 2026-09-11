import { defaultRoutingConfiguration } from './routing.constants';
import { createInMemoryRoutingPrisma } from './create-in-memory-routing-prisma';
import { RoutingService } from './routing.service';

export function createRoutingServiceHarness() {
  const memory = createInMemoryRoutingPrisma();
  const routing = new RoutingService(memory.prisma as never, {
    load: async () => defaultRoutingConfiguration,
  } as never);
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
  return { memory, routing, now };
}
