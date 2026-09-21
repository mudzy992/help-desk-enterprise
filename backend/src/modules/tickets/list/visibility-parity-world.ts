import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../../authorization/create-test-authorization-context';
import { defaultTicketConfidentialConfiguration } from '../confidential/confidential.constants';
import type { TicketConfidentialConfiguration } from '../confidential/confidential.types';
import { createInMemoryTicketsPrisma } from '../create-in-memory-tickets-prisma';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRecord } from '../tickets.types';
import { buildTicketRecord } from './ticket-record-fixture';

/**
 * Test-support: one shared world (units, services, groups, people, tickets in
 * every relationship to them) that the visibility predicates are compared
 * against the previous per-ticket checks in.
 */

// Relative to the real clock on purpose: the previous group-inbox check has no
// injectable clock, and break-glass expiry is compared against "now".
export const now = new Date();
const past = new Date(now.getTime() - 60 * 60 * 1000);
const future = new Date(now.getTime() + 60 * 60 * 1000);

export const units = [
  ['ou-root', '/Korisnici'],
  ['ou-it', '/Korisnici/IT'],
  ['ou-it-hd', '/Korisnici/IT/Helpdesk'],
  ['ou-hr', '/Korisnici/HR'],
  // Names that look like the IT path but are different units: a prefix without
  // the separator, and an underscore that would be a wildcard in SQL LIKE.
  ['ou-itx', '/Korisnici/ITXSupport'],
  ['ou-it-under', '/Korisnici/IT_Support'],
] as const;
export const services = ['service-vpn', 'service-access'] as const;

export const configurations: Record<string, TicketConfidentialConfiguration> = {
  default: defaultTicketConfidentialConfiguration,
  viewers: {
    ...defaultTicketConfidentialConfiguration,
    allowedViewerRoles: [authorizationRoleKeys.agent],
    allowedViewerGroupIds: ['g-viewers'],
  },
  viewerGroupOnly: {
    ...defaultTicketConfidentialConfiguration,
    allowedViewerGroupIds: ['g-viewers'],
  },
  disabled: { ...defaultTicketConfidentialConfiguration, enabled: false },
};

function agent(
  subjectId: string,
  path: string | null,
  serviceId: string | null = null,
  roleKey: string = authorizationRoleKeys.agent,
): AuthorizationContext {
  return createTestAuthorizationContext({
    subjectId,
    assignments: [
      createTestAssignment({
        roleKey,
        permissionKeys: [],
        organizationalUnitId: path === null ? null : 'unit',
        organizationalUnitPath: path,
        serviceId,
      }),
    ],
  });
}

export const actors: Record<string, AuthorizationContext> = {
  requester: createTestAuthorizationContext({
    subjectId: 'user-requester',
    assignments: [],
  }),
  agentIt: agent('u-agent-it', '/Korisnici/IT'),
  agentItVpn: agent('u-agent-it-vpn', '/Korisnici/IT', 'service-vpn'),
  agentRoot: agent('u-agent-root', '/Korisnici'),
  agentHelpdesk: agent('u-agent-hd', '/Korisnici/IT/Helpdesk'),
  agentUnderscore: agent('u-agent-under', '/Korisnici/IT_Support'),
  adminHr: agent('u-admin-hr', '/Korisnici/HR', null, authorizationRoleKeys.admin),
  agentNoPath: agent('u-agent-nopath', null),
  agentBlankService: agent('u-agent-blank', '/Korisnici/IT', '   '),
  multi: createTestAuthorizationContext({
    subjectId: 'u-multi',
    assignments: [
      createTestAssignment({ permissionKeys: [], organizationalUnitPath: '/Korisnici/IT', serviceId: 'service-vpn' }),
      createTestAssignment({ roleKey: authorizationRoleKeys.admin, permissionKeys: [], organizationalUnitPath: '/Korisnici/HR', serviceId: 'service-access' }),
    ],
  }),
  superLocal: createTestAuthorizationContext({
    subjectId: 'u-super-local',
    isSuperAdmin: true,
    isLocalOnly: true,
    assignments: [createTestAssignment({ roleKey: authorizationRoleKeys.superAdmin, permissionKeys: [] })],
  }),
  superRemote: createTestAuthorizationContext({
    subjectId: 'u-super-remote',
    isSuperAdmin: true,
    isLocalOnly: false,
    assignments: [createTestAssignment({ roleKey: authorizationRoleKeys.superAdmin, permissionKeys: [] })],
  }),
  // A relationship to a confidential ticket only matters to someone who may
  // list the ticket at all, so these are IT agents (baseline passes) whose
  // access to confidential tickets comes from the relationship alone.
  assignee: agent('u-assignee', '/Korisnici/IT'),
  groupMember: agent('u-group-member', '/Korisnici/IT'),
  participant: agent('u-participant', '/Korisnici/IT'),
  granted: agent('u-granted', '/Korisnici/IT'),
  groupGranted: agent('u-group-granted', '/Korisnici/IT'),
  glass: agent('u-glass', '/Korisnici/IT'),
  glassExpired: agent('u-glass-expired', '/Korisnici/IT'),
  viewerGroupAgent: agent('u-viewer-group-agent', '/Korisnici/IT', null, authorizationRoleKeys.admin),
  // SuperAdmin passes the baseline everywhere but is "in scope" only when local.
  superLocalAgent: superAdminWithAgentRole('u-super-local-agent', true),
  superRemoteAgent: superAdminWithAgentRole('u-super-remote-agent', false),
};

function superAdminWithAgentRole(
  subjectId: string,
  isLocalOnly: boolean,
): AuthorizationContext {
  return createTestAuthorizationContext({
    subjectId,
    isSuperAdmin: true,
    isLocalOnly,
    assignments: [
      createTestAssignment({ roleKey: authorizationRoleKeys.superAdmin, permissionKeys: [] }),
      createTestAssignment({ permissionKeys: [], organizationalUnitPath: '/Korisnici/IT' }),
    ],
  });
}

export type World = ReturnType<typeof buildWorld>;

export function buildWorld() {
  const memory = createInMemoryTicketsPrisma();
  units.forEach(([id, ouPath]) => memory.seedUnit({ id, parentId: null, ouPath }));
  memory.seedGroupMember({ groupId: 'g-it', userId: 'u-group-member' });
  memory.seedGroupMember({ groupId: 'g-it', userId: 'u-multi' });
  memory.seedGroupMember({ groupId: 'g-viewers', userId: 'u-group-granted' });
  memory.seedGroupMember({ groupId: 'g-viewers', userId: 'u-viewer-group-agent' });

  // Every unit x service, plain and confidential, each confidential ticket
  // reachable through exactly one relationship to the people above.
  const traits: ReadonlyArray<readonly [string, Partial<TicketRecord>]> = [
    ['plain', {}],
    ['conf', { isConfidential: true }],
    ['conf-own', { isConfidential: true, requesterId: 'u-agent-it' }],
    ['conf-assignee', { isConfidential: true, assignedUserId: 'u-assignee' }],
    ['conf-group', { isConfidential: true, assignedGroupId: 'g-it' }],
    ['conf-participant', { isConfidential: true }],
    ['conf-grant', { isConfidential: true }],
    ['conf-group-grant', { isConfidential: true }],
    ['conf-glass', { isConfidential: true }],
    ['conf-glass-expired', { isConfidential: true }],
    // Work-queue tickets for the group inbox parity: only `grp` and
    // `grp-conf` and `grp-own` and `grp-viewers` qualify (unassigned, PENDING).
    ['grp', { assignedGroupId: 'g-it' }],
    ['grp-conf', { assignedGroupId: 'g-it', isConfidential: true }],
    ['grp-own', { assignedGroupId: 'g-it', requesterId: 'u-group-member' }],
    ['grp-viewers', { assignedGroupId: 'g-viewers' }],
    ['grp-other', { assignedGroupId: 'g-other' }],
    ['grp-assigned', { assignedGroupId: 'g-it', assignedUserId: 'u-assignee' }],
    ['grp-active', { assignedGroupId: 'g-it', status: 'IN_PROGRESS' }],
  ];
  const tickets: TicketRecord[] = [];
  for (const [unitId] of units) {
    for (const serviceId of services) {
      for (const [trait, overrides] of traits) {
        const id = `${unitId}:${serviceId}:${trait}`;
        const ticket = buildTicketRecord({ id, originUnitId: unitId, serviceId, ...overrides });
        tickets.push(ticket);
        memory.tickets.set(id, ticket);
        link(memory, trait, id);
      }
    }
  }
  return { memory, prisma: memory.prisma as unknown as PrismaService, tickets };
}

function link(memory: ReturnType<typeof createInMemoryTicketsPrisma>, trait: string, ticketId: string): void {
  const base = { ticketId, createdAt: now };
  if (trait === 'conf-participant') {
    memory.participants.set(`p-${ticketId}`, { id: `p-${ticketId}`, role: 'WATCHER', userId: 'u-participant', groupId: null, ...base });
  }
  if (trait === 'conf-grant') {
    memory.confidentialGrants.set(`g-${ticketId}`, { id: `g-${ticketId}`, userId: 'u-granted', groupId: null, grantedByUserId: 'u-admin', ...base });
  }
  if (trait === 'conf-group-grant') {
    memory.confidentialGrants.set(`g-${ticketId}`, { id: `g-${ticketId}`, userId: null, groupId: 'g-viewers', grantedByUserId: 'u-admin', ...base });
  }
  if (trait === 'conf-glass') {
    memory.breakGlassEvents.set(`b-${ticketId}`, { id: `b-${ticketId}`, actorUserId: 'u-glass', reason: 'incident', expiresAt: future, ...base });
  }
  if (trait === 'conf-glass-expired') {
    memory.breakGlassEvents.set(`b-${ticketId}`, { id: `b-${ticketId}`, actorUserId: 'u-glass-expired', reason: 'incident', expiresAt: past, ...base });
  }
}
