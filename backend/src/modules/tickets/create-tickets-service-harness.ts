import { authorizationRoleKeys } from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { defaultRoutingConfiguration } from '../routing/routing.constants';
import { RoutingService } from '../routing/routing.service';
import { createInMemoryTicketsPrisma } from './create-in-memory-tickets-prisma';
import { TicketsService } from './tickets.service';

export const ticketsTestIds = {
  ouIt: 'ou-it',
  ouHr: 'ou-hr',
  ouRoot: 'ou-root',
  serviceVpn: 'service-vpn',
  serviceDraft: 'service-draft',
  formVpnV1: 'form-vpn-v1',
  formVpnV2: 'form-vpn-v2',
  formOther: 'form-other',
  groupIt: 'group-it',
  requester: 'user-requester',
  agentIt: 'user-agent-it',
  agentHr: 'user-agent-hr',
  superAdmin: 'user-super-admin',
} as const;

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
  const routing = new RoutingService(memory.prisma as never, {
    load: async () => defaultRoutingConfiguration,
  } as never);
  const tickets = new TicketsService(memory.prisma as never, routing, {
    loadBySubjectId: async (subjectId: string) =>
      contexts.get(subjectId) ?? null,
  } as never);

  memory.seedUnit({ id: ticketsTestIds.ouRoot, parentId: null, ouPath: '/Korisnici' });
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
  seedDefaultContexts(contexts);
  return { memory, routing, tickets, contexts };
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

function seedDefaultContexts(
  contexts: Map<string, AuthorizationContext>,
): void {
  contexts.set(
    ticketsTestIds.requester,
    createTestAuthorizationContext({
      subjectId: ticketsTestIds.requester,
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.user,
          permissionKeys: [],
        }),
      ],
    }),
  );
  contexts.set(
    ticketsTestIds.agentIt,
    createTestAuthorizationContext({
      subjectId: ticketsTestIds.agentIt,
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.agent,
          organizationalUnitId: ticketsTestIds.ouIt,
          organizationalUnitPath: '/Korisnici/IT',
          permissionKeys: [],
        }),
      ],
    }),
  );
  contexts.set(
    ticketsTestIds.agentHr,
    createTestAuthorizationContext({
      subjectId: ticketsTestIds.agentHr,
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.agent,
          organizationalUnitId: ticketsTestIds.ouHr,
          organizationalUnitPath: '/Korisnici/HR',
          permissionKeys: [],
        }),
      ],
    }),
  );
  contexts.set(
    ticketsTestIds.superAdmin,
    createTestAuthorizationContext({
      subjectId: ticketsTestIds.superAdmin,
      isLocalOnly: true,
      isSuperAdmin: true,
      assignments: [
        createTestAssignment({
          roleKey: authorizationRoleKeys.superAdmin,
          permissionKeys: [],
        }),
      ],
    }),
  );
}

export const vpnFormSchema = formSchema;
