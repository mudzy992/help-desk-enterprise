import type { AuthorizationContext } from '../authorization/authorization.types';
import { defaultRoutingConfiguration } from '../routing/routing.constants';
import { RoutingService } from '../routing/routing.service';
import { defaultTicketAssignmentConfiguration } from './assignment/assignment.constants';
import { TicketAssignmentService } from './assignment/ticket-assignment.service';
import { createInMemoryTicketsPrisma } from './create-in-memory-tickets-prisma';
import { seedTicketsHarnessActors } from './seed-tickets-harness-actors';
import { ticketsTestIds } from './tickets-test-ids';
import { TicketsService } from './tickets.service';

export { ticketsTestIds } from './tickets-test-ids';

const formSchema = {
  schemaVersion: 1,
  fields: [
    {
      id: 'asset_tag',
      label: 'Asset tag',
      type: 'text',
      required: true,
      order: 0,
    },
  ],
};

export function createTicketsServiceHarness() {
  const memory = createInMemoryTicketsPrisma();
  const contexts = new Map<string, AuthorizationContext>();
  const assignmentConfig: {
    groupInboxEnabled: boolean;
    autoAssignEnabled: boolean;
    autoAssignStrategy: 'LEAST_BUSY' | 'ROUND_ROBIN';
  } = {
    groupInboxEnabled: defaultTicketAssignmentConfiguration.groupInboxEnabled,
    autoAssignEnabled: defaultTicketAssignmentConfiguration.autoAssignEnabled,
    autoAssignStrategy:
      defaultTicketAssignmentConfiguration.autoAssignStrategy,
  };
  const authorizationContextLoader = {
    loadBySubjectId: async (subjectId: string) =>
      contexts.get(subjectId) ?? null,
  };
  const routing = new RoutingService(memory.prisma as never, {
    load: async () => defaultRoutingConfiguration,
  } as never);
  const assignment = new TicketAssignmentService(
    memory.prisma as never,
    authorizationContextLoader as never,
    { load: async () => ({ ...assignmentConfig }) } as never,
  );
  const tickets = new TicketsService(
    memory.prisma as never,
    routing,
    authorizationContextLoader as never,
    assignment,
  );
  seedHarnessCatalog(memory);
  seedTicketsHarnessActors(contexts);
  return { memory, routing, tickets, contexts, assignmentConfig };
}

function seedHarnessCatalog(
  memory: ReturnType<typeof createInMemoryTicketsPrisma>,
): void {
  memory.seedUnit({
    id: ticketsTestIds.ouRoot,
    parentId: null,
    ouPath: '/Korisnici',
  });
  memory.seedUnit({
    id: ticketsTestIds.ouIt,
    parentId: ticketsTestIds.ouRoot,
    ouPath: '/Korisnici/IT',
  });
  memory.seedUnit({
    id: ticketsTestIds.ouHr,
    parentId: ticketsTestIds.ouRoot,
    ouPath: '/Korisnici/HR',
  });
  memory.seedService({
    id: ticketsTestIds.serviceVpn,
    name: 'VPN access',
    lifecycle: 'ACTIVE',
    availability: 'OPERATIONAL',
    classification: 'INTERNAL',
    isConfidentialDefault: false,
  });
  memory.seedService({
    id: ticketsTestIds.serviceDraft,
    name: 'Draft only',
    lifecycle: 'DRAFT',
    availability: 'OPERATIONAL',
    classification: 'INTERNAL',
    isConfidentialDefault: false,
  });
  memory.seedGroup({ id: ticketsTestIds.groupIt, name: 'IT Support' });
  memory.seedUser({
    id: ticketsTestIds.requester,
    organizationalUnitId: ticketsTestIds.ouIt,
  });
  memory.seedUser({
    id: ticketsTestIds.agentIt,
    organizationalUnitId: ticketsTestIds.ouIt,
  });
  memory.seedUser({
    id: ticketsTestIds.agentHr,
    organizationalUnitId: ticketsTestIds.ouHr,
  });
  memory.seedUser({
    id: ticketsTestIds.superAdmin,
    organizationalUnitId: null,
  });
  seedDefaultFormVersions(memory);
}

function seedDefaultFormVersions(
  memory: ReturnType<typeof createInMemoryTicketsPrisma>,
): void {
  const now = new Date('2026-09-11T12:00:00.000Z');
  memory.seedFormVersion({
    id: ticketsTestIds.formVpnV1,
    serviceId: ticketsTestIds.serviceVpn,
    version: 1,
    schema: formSchema,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  memory.seedFormVersion({
    id: ticketsTestIds.formOther,
    serviceId: ticketsTestIds.serviceDraft,
    version: 1,
    schema: formSchema,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
}

export const vpnFormSchema = formSchema;
