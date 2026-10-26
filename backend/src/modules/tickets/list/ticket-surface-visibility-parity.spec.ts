import type { TicketRecord } from '../tickets.types';
import { loadTicketVisibilityInputs } from './load-ticket-visibility-inputs';
import { buildTicketSurfaceVisibility } from './build-ticket-surface-visibility';
import { actors, buildWorld, configurations, now } from './visibility-parity-world';

jest.mock('../../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));

const derivedReadSurfaces = ['detail', 'list', 'count', 'summary', 'search'] as const;

describe('ticket surface visibility capability parity', () => {
  const world = buildWorld();
  for (const [configurationName, configuration] of Object.entries(configurations)) {
    for (const [actorName, context] of Object.entries(actors)) {
      it(`${actorName} has identical detail/list/count/summary/search population under ${configurationName}`, async () => {
        const visibility = {
          context,
          ...(await loadTicketVisibilityInputs(world.prisma, context.subjectId)),
          configuration,
          now,
        };
        const populations = await Promise.all(derivedReadSurfaces.map(async (surface) => {
          const where = buildTicketSurfaceVisibility({ surface, visibility });
          const records = await world.memory.prisma.ticket.findMany({ where: where ?? { id: '__none__' } });
          return records.map((ticket: TicketRecord) => ticket.id).sort();
        }));
        for (const population of populations.slice(1)) expect(population).toEqual(populations[0]);
      });
    }
  }

  it('group inbox is a narrowing of canonical read visibility', async () => {
    const context = actors.agentIt;
    const visibility = {
      context,
      ...(await loadTicketVisibilityInputs(world.prisma, context.subjectId)),
      configuration: configurations.default,
      now,
    };
    const read = await world.memory.prisma.ticket.findMany({ where: buildTicketSurfaceVisibility({ surface: 'list', visibility })! });
    const inboxWhere = buildTicketSurfaceVisibility({ surface: 'group_inbox', visibility });
    const inbox = inboxWhere === null ? [] : await world.memory.prisma.ticket.findMany({ where: inboxWhere });
    const readable = new Set(read.map((ticket: TicketRecord) => ticket.id));
    expect(inbox.every((ticket: TicketRecord) => readable.has(ticket.id))).toBe(true);
  });
});
