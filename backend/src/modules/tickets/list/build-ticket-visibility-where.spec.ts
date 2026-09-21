import type { AuthorizationContext } from '../../authorization/authorization.types';
import { canManageTicketsInScope } from '../authorize-ticket-actor';
import { isConfidentialTicketVisible } from '../confidential/assert-confidential-ticket-access';
import type { TicketConfidentialConfiguration } from '../confidential/confidential.types';
import type { TicketRecord } from '../tickets.types';
import { buildTicketVisibilityWhere } from './build-ticket-visibility-where';
import { loadTicketVisibilityInputs } from './load-ticket-visibility-inputs';
import {
  actors,
  buildWorld,
  configurations,
  now,
  units,
  type World,
} from './visibility-parity-world';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

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
      canManageTicketsInScope({
        context,
        originUnitId: ticket.originUnitId,
        originUnitPath,
        serviceId: ticket.serviceId,
      });
    if (
      baseline &&
      (await isConfidentialTicketVisible(world.prisma, {
        context,
        ticket,
        originUnitPath,
        configuration,
        now,
      }))
    ) {
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
  const inputs = await loadTicketVisibilityInputs(
    world.prisma,
    context.subjectId,
  );
  const found = await world.memory.prisma.ticket.findMany({
    where: {
      AND: buildTicketVisibilityWhere({
        context,
        ...inputs,
        configuration,
        now,
      }),
    },
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
