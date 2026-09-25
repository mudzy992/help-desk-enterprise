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
import { listGroupInboxTickets } from '../list/list-group-inbox-tickets';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

/** The previous inbox logic (`listGroupInboxTickets`): the oracle. */
// "Previous logic" now means the new paginated `listGroupInboxTickets`
// (already covered by its own oracle when it replaced the old per-ticket
// loop); this spec instead compares it against the `where` builder it is
// built from, over every page.
async function inboxByPreviousLogic(
  world: World,
  context: AuthorizationContext,
  configuration: TicketConfidentialConfiguration,
): Promise<string[]> {
  const ids: string[] = [];
  let pageNumber = 1;
  for (;;) {
    const page = await listGroupInboxTickets(
      world.prisma,
      { loadBySubjectId: async () => context } as never,
      { load: async () => ({ groupInboxEnabled: true }) } as never,
      { actorUserId: context.subjectId, confidential: configuration },
      { page: pageNumber, pageSize: 25 },
    );
    ids.push(...page.records.map((ticket) => ticket.id));
    if (ids.length >= page.total) {
      break;
    }
    pageNumber += 1;
  }
  return ids.sort();
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
    // Decision D1 (package 1.1): the group's queue follows the group, not the
    // OU. The member is an IT agent, yet HR-unit tickets handled by their
    // group (e.g. forwarded there) are in their inbox.
    expect(member.some((id) => id.startsWith('ou-hr:'))).toBe(true);
    expect((await inbox('requester')).length).toBe(0);
    // SuperAdmin sees every group's queue, not only their own.
    const superLocal = await inbox('superLocal');
    expect(superLocal.some((id) => id.endsWith(':grp-other'))).toBe(true);
    expect(member.some((id) => id.endsWith(':grp-other'))).toBe(false);
    // Service-scoped assignments no longer limit the group's own queue (D1):
    // a member works every ticket handled by their group, and nothing else.
    const multi = await inbox('multi');
    expect(multi.length).toBeGreaterThan(0);
    expect(multi.every((id) => /:(grp|grp-conf|grp-own|conf-group)$/.test(id))).toBe(true);
    expect(multi.some((id) => id.startsWith('ou-hr:service-access:'))).toBe(true);
  });

  it('D1: a ticket of the caller\'s group from an OU outside their scope is in list and inbox', async () => {
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
    expect(await inboxByWhere(world, context, configurations.default)).toContain(
      'ou-hr:service-vpn:grp-own',
    );
    // Other groups' work outside their scope stays hidden in both.
    expect(list.some((ticket: TicketRecord) => ticket.id === 'ou-hr:service-vpn:grp-other')).toBe(false);
  });
});
