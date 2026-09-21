import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../../authorization/create-test-authorization-context';
import { canManageTicketsInScope } from '../authorize-ticket-actor';
import { isConfidentialTicketVisible } from '../confidential/assert-confidential-ticket-access';
import { defaultTicketConfidentialConfiguration } from '../confidential/confidential.constants';
import type { TicketConfidentialConfiguration } from '../confidential/confidential.types';
import { createInMemoryTicketsPrisma } from '../create-in-memory-tickets-prisma';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketRecord } from '../tickets.types';
import { buildTicketVisibilityWhere } from './build-ticket-visibility-where';
import { loadTicketVisibilityInputs } from './load-ticket-visibility-inputs';
import { buildTicketRecord } from './ticket-record-fixture';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const now = new Date('2026-06-01T12:00:00.000Z');
const past = new Date('2026-06-01T11:00:00.000Z');
const future = new Date('2026-06-01T13:00:00.000Z');

const units = [
  ['ou-root', '/Korisnici'],
  ['ou-it', '/Korisnici/IT'],
  ['ou-it-hd', '/Korisnici/IT/Helpdesk'],
  ['ou-hr', '/Korisnici/HR'],
  // Names that look like the IT path but are different units: a prefix without
  // the separator, and an underscore that would be a wildcard in SQL LIKE.
  ['ou-itx', '/Korisnici/ITXSupport'],
  ['ou-it-under', '/Korisnici/IT_Support'],
] as const;
const services = ['service-vpn', 'service-access'] as const;

const configurations: Record<string, TicketConfidentialConfiguration> = {
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

const actors: Record<string, AuthorizationContext> = {
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

type World = ReturnType<typeof buildWorld>;

function buildWorld() {
  const memory = createInMemoryTicketsPrisma();
  units.forEach(([id, ouPath]) => memory.seedUnit({ id, parentId: null, ouPath }));
  memory.seedGroupMember({ groupId: 'g-it', userId: 'u-group-member' });
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

/** The previous list logic, one ticket at a time: the oracle. */
async function visibleByPerTicketCheck(
  world: World,
  context: AuthorizationContext,
  configuration: TicketConfidentialConfiguration,
): Promise<string[]> {
  const pathById = new Map<string, string>(units);
  const visible: string[] = [];
  for (const ticket of world.tickets) {
    const originUnitPath = pathById.get(ticket.originUnitId);
    if (originUnitPath === undefined) {
      continue;
    }
    const baseline =
      context.isSuperAdmin ||
      context.subjectId === ticket.requesterId ||
      canManageTicketsInScope({ context, originUnitId: ticket.originUnitId, originUnitPath, serviceId: ticket.serviceId });
    if (baseline && (await isConfidentialTicketVisible(world.prisma, { context, ticket, originUnitPath, configuration, now }))) {
      visible.push(ticket.id);
    }
  }
  return visible.sort();
}

async function visibleByWhere(
  world: World,
  context: AuthorizationContext,
  configuration: TicketConfidentialConfiguration,
): Promise<string[]> {
  const inputs = await loadTicketVisibilityInputs(world.prisma, context.subjectId);
  const found = await world.memory.prisma.ticket.findMany({
    where: { AND: buildTicketVisibilityWhere({ context, ...inputs, configuration, now }) },
  });
  return found.map((ticket: TicketRecord) => ticket.id).sort();
}

describe('buildTicketVisibilityWhere matches the per-ticket visibility check', () => {
  const world = buildWorld();

  for (const [configName, configuration] of Object.entries(configurations)) {
    for (const [actorName, context] of Object.entries(actors)) {
      it(`${actorName} under "${configName}" configuration`, async () => {
        const expected = await visibleByPerTicketCheck(world, context, configuration);
        const actual = await visibleByWhere(world, context, configuration);
        expect(actual).toEqual(expected);
      });
    }
  }

  it('is not vacuous: scope and confidentiality both hide and reveal tickets', async () => {
    const all = world.tickets.length;
    const agentIt = await visibleByWhere(world, actors.agentIt, configurations.default);
    const requester = await visibleByWhere(world, actors.requester, configurations.default);
    const superLocal = await visibleByWhere(world, actors.superLocal, configurations.default);
    expect(agentIt.length).toBeGreaterThan(0);
    expect(agentIt.length).toBeLessThan(all);
    expect(requester.length).toBeGreaterThan(0);
    expect(superLocal.length).toBeLessThan(all);
    // Sibling units whose names merely resemble the IT path stay out of scope.
    const plain = agentIt.filter((id) => id.endsWith(':plain'));
    expect(plain.some((id) => id.startsWith('ou-itx:'))).toBe(false);
    expect(plain.some((id) => id.startsWith('ou-it-under:'))).toBe(false);
    // Confidential tickets are hidden from a plain in-scope agent...
    expect(agentIt.some((id) => id.endsWith(':conf'))).toBe(false);
    // ...and each relationship reveals its own ticket and nothing else.
    const via = async (actor: string, config = 'default') =>
      (await visibleByWhere(world, actors[actor], configurations[config]))
        .filter((id) => id.startsWith('ou-it:service-vpn:conf'));
    expect(await via('assignee')).toEqual(['ou-it:service-vpn:conf-assignee']);
    expect(await via('groupMember')).toEqual(['ou-it:service-vpn:conf-group']);
    expect(await via('participant')).toEqual(['ou-it:service-vpn:conf-participant']);
    expect(await via('granted')).toEqual(['ou-it:service-vpn:conf-grant']);
    expect(await via('groupGranted')).toEqual(['ou-it:service-vpn:conf-group-grant']);
    expect(await via('glass')).toEqual(['ou-it:service-vpn:conf-glass']);
    expect(await via('glassExpired')).toEqual([]);
    expect((await via('agentIt', 'viewers')).length).toBe(9);
    expect(await via('superRemoteAgent', 'viewers')).toEqual([]);
    // ...and the Helpdesk sub-unit is inside it.
    expect(plain.some((id) => id.startsWith('ou-it-hd:'))).toBe(true);
  });
});
