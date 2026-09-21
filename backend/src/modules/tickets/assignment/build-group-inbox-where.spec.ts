import type { AuthorizationContext } from '../../authorization/authorization.types';
import type { TicketConfidentialConfiguration } from '../confidential/confidential.types';
import { buildTicketVisibilityWhere } from '../list/build-ticket-visibility-where';
import { loadTicketVisibilityInputs } from '../list/load-ticket-visibility-inputs';
import {
  actors,
  buildWorld,
  configurations,
  now,
  type World,
} from '../list/visibility-parity-world';
import type { TicketRecord } from '../tickets.types';
import { buildGroupInboxWhere } from './build-group-inbox-where';
import { listGroupInboxTickets } from './list-group-inbox-tickets';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/** The previous inbox logic (`listGroupInboxTickets`): the oracle. */
async function inboxByPreviousLogic(
  world: World,
  context: AuthorizationContext,
  configuration: TicketConfidentialConfiguration,
): Promise<string[]> {
  const records = await listGroupInboxTickets(
    world.prisma,
    { loadBySubjectId: async () => context } as never,
    { load: async () => ({ groupInboxEnabled: true }) } as never,
    { actorUserId: context.subjectId, confidential: configuration },
  );
  return records.map((ticket) => ticket.id).sort();
}

async function inboxByWhere(
  world: World,
  context: AuthorizationContext,
  configuration: TicketConfidentialConfiguration,
): Promise<string[]> {
  const inputs = await loadTicketVisibilityInputs(
    world.prisma,
    context.subjectId,
  );
  const clauses = buildGroupInboxWhere({ context, ...inputs, configuration, now });
  if (clauses === null) {
    return [];
  }
  const found = await world.memory.prisma.ticket.findMany({
    where: { AND: clauses },
  });
  return found.map((ticket: TicketRecord) => ticket.id).sort();
}

describe('buildGroupInboxWhere matches the previous group inbox logic', () => {
  const world = buildWorld();

  for (const [configName, configuration] of Object.entries(configurations)) {
    for (const [actorName, context] of Object.entries(actors)) {
      it(`${actorName} under "${configName}" configuration`, async () => {
        const expected = await inboxByPreviousLogic(world, context, configuration);
        const actual = await inboxByWhere(world, context, configuration);
        expect(actual).toEqual(expected);
      });
    }
  }

  it('is not vacuous: only unassigned PENDING tickets of the caller\'s groups, by scope', async () => {
    const inbox = (actor: string) =>
      inboxByWhere(world, actors[actor], configurations.default);
    const member = await inbox('groupMember');
    expect(member.length).toBeGreaterThan(0);
    // Only the group's unassigned PENDING work; never assigned or in-progress.
    expect(member.every((id) => /:(grp|grp-conf|grp-own|conf-group)$/.test(id))).toBe(true);
    expect(member.some((id) => id.endsWith(':grp-assigned') || id.endsWith(':grp-active'))).toBe(false);
    // Scope still applies: the member is an IT agent, so no HR-unit tickets,
    // even the one they requested themselves (the list shows those, the inbox
    // is a work queue and does not).
    expect(member.some((id) => id.startsWith('ou-hr:'))).toBe(false);
    expect((await inbox('requester')).length).toBe(0);
    // SuperAdmin sees every group's queue, not only their own.
    const superLocal = await inbox('superLocal');
    expect(superLocal.some((id) => id.endsWith(':grp-other'))).toBe(true);
    expect(member.some((id) => id.endsWith(':grp-other'))).toBe(false);
    // Service-scoped assignments only reach their own unit and service: IT/vpn
    // (and its Helpdesk sub-unit) and HR/access, nothing else.
    const multi = await inbox('multi');
    expect(multi.length).toBeGreaterThan(0);
    expect(
      multi.every((id) =>
        /^(ou-it|ou-it-hd):service-vpn:|^ou-hr:service-access:/.test(id),
      ),
    ).toBe(true);
    expect(multi.some((id) => id.startsWith('ou-hr:service-access:'))).toBe(true);
    expect(multi.some((id) => id.startsWith('ou-it:service-access:'))).toBe(false);
  });

  it('keeps the list and the inbox different for a requester outside their scope', async () => {
    const context = actors.groupMember;
    const inputs = await loadTicketVisibilityInputs(world.prisma, context.subjectId);
    const list = await world.memory.prisma.ticket.findMany({
      where: {
        AND: buildTicketVisibilityWhere({
          context,
          ...inputs,
          configuration: configurations.default,
          now,
        }),
      },
    });
    expect(list.some((ticket: TicketRecord) => ticket.id === 'ou-hr:service-vpn:grp-own')).toBe(true);
    expect(await inboxByWhere(world, context, configurations.default)).not.toContain(
      'ou-hr:service-vpn:grp-own',
    );
  });
});
