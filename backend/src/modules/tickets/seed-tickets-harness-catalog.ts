import { createInMemoryTicketsPrisma } from './create-in-memory-tickets-prisma';
import { ticketsTestIds } from './tickets-test-ids';

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

export const vpnFormSchema = formSchema;

export function seedTicketsHarnessCatalog(
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
  memory.seedService({
    id: ticketsTestIds.serviceAccess,
    name: 'Access request',
    lifecycle: 'ACTIVE',
    availability: 'OPERATIONAL',
    classification: 'INTERNAL',
    isConfidentialDefault: false,
    requiresApproval: true,
  });
  memory.seedGroup({ id: ticketsTestIds.groupIt, name: 'IT Support' });
  memory.seedUser({
    id: ticketsTestIds.requester,
    organizationalUnitId: ticketsTestIds.ouIt,
  });
  memory.seedUser({
    id: ticketsTestIds.watcher,
    organizationalUnitId: ticketsTestIds.ouIt,
  });
  memory.seedUser({
    id: ticketsTestIds.agentIt,
    organizationalUnitId: ticketsTestIds.ouIt,
  });
  memory.seedUser({
    id: ticketsTestIds.agentItPeer,
    organizationalUnitId: ticketsTestIds.ouIt,
  });
  memory.seedUser({
    id: ticketsTestIds.agentHr,
    organizationalUnitId: ticketsTestIds.ouHr,
  });
  memory.seedUser({
    id: ticketsTestIds.adminIt,
    organizationalUnitId: ticketsTestIds.ouIt,
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
  for (const version of [
    {
      id: ticketsTestIds.formVpnV1,
      serviceId: ticketsTestIds.serviceVpn,
    },
    {
      id: ticketsTestIds.formOther,
      serviceId: ticketsTestIds.serviceDraft,
    },
    {
      id: ticketsTestIds.formAccessV1,
      serviceId: ticketsTestIds.serviceAccess,
    },
  ]) {
    memory.seedFormVersion({
      ...version,
      version: 1,
      schema: formSchema,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });
  }
}
