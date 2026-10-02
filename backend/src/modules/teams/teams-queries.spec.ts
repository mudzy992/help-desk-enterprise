import { InMemoryTeamsSimulatorOutbox, SimulatorTeamsTransport, simulatorServiceUrl } from './simulator-teams-transport';
import { TicketsError } from '../tickets/tickets.error';
import { parseTeamsActivity } from './teams-activity';
import { TeamsActivityRouter, type TeamsQueryHandler } from './teams-activity-router.service';
import { buildTeamsManifest, validateTeamsManifest } from './teams-app-package';
import { parseTeamsInput } from './teams-commands';
import type { TeamsConfiguration } from './teams-configuration.service';
import { TeamsQueriesService } from './teams-queries.service';
import { ticketDetailCard, ticketListCard } from './teams-query-cards';
import { simulatorTenantId } from './teams.constants';

const config = {
  mode: 'simulator',
  actionsEnabled: true,
  ticketCreateEnabled: true,
  publicUrl: 'https://desk.example.com',
  defaultLocale: 'bs',
  appName: 'Desk',
  channelEnabled: true,
} as unknown as TeamsConfiguration;
const json = (value: unknown) => JSON.stringify(value);

describe('parseTeamsInput (§20b.1)', () => {
  it.each([
    ['tiket HD-123', 'ticket', 'HD-123'],
    ['Ticket hd-7', 'ticket', 'hd-7'],
    ['HD-000123', 'ticket', 'HD-000123'],
    ['traži VPN lozinka', 'search', 'VPN lozinka'],
    ['trazi štampač', 'search', 'štampač'],
    ['search printer', 'search', 'printer'],
    ['Odobrenja', 'approvals', ''],
    ['status', 'status', ''],
    ['Dodijeljeni', 'assigned', ''],
    ['RED', 'queue', ''],
    ['sla', 'sla', ''],
    ['cab', 'cab', ''],
    ['Dežurni', 'onCall', ''],
    ['dezurni', 'onCall', ''],
    ['on-call', 'onCall', ''],
    ['moji tiketi', 'myTickets', ''],
    ['<at>Desk</at> pomoć', 'help', ''],
    ['tiket', 'ticket', ''],
    ['zdravo kako si', 'unknown', ''],
  ])('%s → %s', (text, command, argument) => {
    expect(parseTeamsInput(text)).toEqual({ command, argument });
  });
});

describe('query cards', () => {
  const card = { locale: 'bs' as const, timeZone: 'Europe/Sarajevo', publicUrl: 'https://desk.example.com' };
  const row = { id: 't1', ticketNumber: 'HD-1', title: 'VPN *pao*', status: 'ASSIGNED', priority: 'HIGH', isOverdue: true, isAtRisk: false, dueAt: '2026-10-02T10:00:00.000Z', assignedUserId: null };

  it('lists with SLA flag, claim button, „Prikazano X od Y“ and „Otvori sve“', () => {
    const out = json(ticketListCard(card, { titleKey: 'queueTitle', emptyKey: 'queueEmpty', rows: [row], total: 12, path: '/tickets?view=inbox', claim: true }));
    expect(out).toContain('SLA probijen');
    expect(out).toContain('"verb":"ticket.claim"');
    expect(out).toContain('Prikazano 1 od 12.');
    expect(out).toContain('https://desk.example.com/tickets?view=inbox');
    expect(out).toContain('VPN \\\\*pao\\\\*');
    expect(out).toMatch(/Rok: [^"]*2026[^"]*12:00/);
  });

  it('has no „Otvori sve“ without a public URL and an empty text without rows', () => {
    const out = json(ticketListCard({ ...card, publicUrl: null }, { titleKey: 'assignedTitle', emptyKey: 'assignedEmpty', rows: [], total: 0, path: '/x' }));
    expect(out).toContain('Nemate dodijeljenih');
    expect(out).not.toContain('Otvori sve');
  });

  it('ticket card: staff get claim and note, requesters only reply', () => {
    const facts = { ...row, serviceName: 'Mreža', groupName: 'IT', assigneeName: null, requesterName: 'Ana', isConfidential: false };
    const staff = json(ticketDetailCard(card, facts, { isStaff: true, actionsEnabled: true }));
    expect(staff).toContain('ticket.claim');
    expect(staff).toContain('ticket.note');
    expect(staff).toContain('Ana');
    const requester = json(ticketDetailCard(card, facts, { isStaff: false, actionsEnabled: true }));
    expect(requester).not.toContain('ticket.claim');
    expect(requester).not.toContain('ticket.note');
    expect(requester).toContain('ticket.reply');
    expect(requester).not.toContain('Ana');
    expect(json(ticketDetailCard(card, { ...facts, status: 'CLOSED' }, { isStaff: true, actionsEnabled: true }))).not.toContain('ticket.reply');
  });
});

type Staff = 'USER' | 'AGENT';

function querySetup(options: { role?: Staff; ticket?: 'visible' | 'hidden' | 'missing'; inboxDisabled?: boolean; changes?: boolean; onCallRead?: boolean } = {}) {
  const role = options.role ?? 'AGENT';
  const principal = { roleKeys: [role], assignments: [{ roleKey: role, permissionKeys: options.onCallRead ? ['oncall.read'] : [], organizationalUnitPath: null }] };
  const ticketResponse = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    ticketNumber: `HD-${id}`,
    title: `Tiket ${id}`,
    status: 'ASSIGNED',
    priority: 'MEDIUM',
    isOverdue: false,
    isAtRisk: false,
    assignedUserId: null,
    sla: { resolutionDueAt: '2026-10-03T08:00:00.000Z' },
    serviceName: 'Mreža',
    assignedGroupName: 'IT',
    requesterName: 'Ana',
    isConfidential: false,
    ...extra,
  });
  const prisma = {
    ticket: { findFirst: jest.fn(async () => (options.ticket === 'missing' ? null : { id: 't1' })) },
    ticketApproval: { findMany: jest.fn(async () => [{ ticketId: 't5' }, { ticketId: 't6' }]), count: jest.fn(async () => 7) },
  };
  const tickets = {
    getById: jest.fn(async (id: string) => (options.ticket === 'hidden' ? Promise.reject(new TicketsError('NOT_FOUND' as never)) : ticketResponse(id))),
    listPage: jest.fn(async (query: Record<string, unknown>) => ({
      items: query.unassigned ? [ticketResponse('u1')] : [ticketResponse('a1', { isAtRisk: true }), ticketResponse('a2'), ticketResponse('a3', { isOverdue: true })],
      total: query.unassigned ? 1 : 3,
    })),
    listInbox: jest.fn(async () => (options.inboxDisabled ? Promise.reject(new TicketsError('GROUP_INBOX_DISABLED' as never)) : { items: [ticketResponse('q1', { isOverdue: true })], total: 4 })),
  };
  const knowledge = {
    list: jest.fn(async () => Array.from({ length: 7 }, (_, index) => ({ id: `k${index}`, slug: `k-${index}`, title: `Članak ${index}`, body: '## Koraci\n1. **Restart**', serviceName: 'Mreža' }))),
  };
  const statusPage = {
    page: jest.fn(async () => ({
      configuration: { enabled: true },
      activeIncidents: [{ title: 'Prekid e-pošte', titleEn: 'E-mail outage', impact: 'MAJOR', startedAt: '2026-10-02T07:00:00.000Z', services: [{ id: 's', name: 'E-pošta' }] }],
      planned: [{ serviceId: 's', serviceName: 'ERP', startsAt: '2026-10-04T18:00:00.000Z', endsAt: '2026-10-04T20:00:00.000Z', message: null }],
    })),
  };
  const onCall = {
    isEnabled: jest.fn(async () => true),
    overview: jest.fn(async () => ({ groups: [{ groupId: 'g1', groupName: 'Mreža', hasSchedule: true, isActive: true, current: { userId: 'x', displayName: 'Edin', endsAt: '2026-10-03T06:00:00.000Z', source: 'ROTATION' } }] })),
    me: jest.fn(async () => ({ enabled: true, current: [], next: { groupId: 'g1', groupName: 'Mreža', startsAt: '2026-10-05T06:00:00.000Z', endsAt: '2026-10-06T06:00:00.000Z' } })),
  };
  const changes = { list: jest.fn(async () => ({ items: [{ id: 'c1' }, { id: 'c2' }], total: 2 })) };
  const changeAccess = { isEnabled: jest.fn(async () => options.changes ?? true) };
  const delivery = { buildForKind: jest.fn(async (type: string, id: string) => ({ card: { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: `${type}:${id}` }] } })) };
  const settings = { getSetting: jest.fn(async () => 'Europe/Sarajevo') };
  const router = { registerQueryHandler: jest.fn() };
  const service = new TeamsQueriesService(
    prisma as never,
    router as never,
    { load: jest.fn(async () => principal) } as never,
    settings as never,
    tickets as never,
    knowledge as never,
    statusPage as never,
    onCall as never,
    changes as never,
    changeAccess as never,
    delivery as never,
  );
  const ask = async (text: string) => {
    const parsed = parseTeamsInput(text);
    return service.answer({ ...parsed, text, user: { id: 'me', displayName: 'Ana', locale: 'bs' }, config });
  };
  return { service, ask, prisma, tickets, knowledge, changes, delivery, onCall };
}

describe('TeamsQueriesService', () => {
  it('shows a ticket through getById (access checked) and hides missing / foreign ones alike', async () => {
    const { ask, tickets } = querySetup();
    expect(json(await ask('tiket HD-1'))).toContain('Tiket HD-t1');
    expect(tickets.getById).toHaveBeenCalledWith('t1', { actorUserId: 'me', messageSource: 'TEAMS' });
    expect(json(await querySetup({ ticket: 'hidden' }).ask('tiket HD-1'))).toContain('ne postoji ili vam nije dostupan');
    expect(json(await querySetup({ ticket: 'missing' }).ask('tiket HD-1'))).toContain('ne postoji ili vam nije dostupan');
    // A bare number that is no ticket falls back to help (null).
    expect(await querySetup({ ticket: 'missing' }).ask('HD-1')).toBeNull();
  });

  it('searches published articles, 5 shown with „Prikazano 5 od 7“', async () => {
    const { ask, knowledge } = querySetup({ role: 'USER' });
    const out = json(await ask('traži vpn'));
    expect(knowledge.list).toHaveBeenCalledWith({ q: 'vpn', status: 'PUBLISHED' }, { actorUserId: 'me' });
    expect(out).toContain('Članak 4');
    expect(out).not.toContain('Članak 5');
    expect(out).toContain('Prikazano 5 od 7.');
    expect(out).toContain('knowledge-base?q=vpn');
    expect(out).not.toContain('##');
  });

  it('approvals: summary plus the existing approval cards of the user', async () => {
    const { ask, prisma, delivery } = querySetup({ role: 'USER' });
    const cards = (await ask('odobrenja'))!;
    expect(prisma.ticketApproval.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ approverUserId: 'me', status: 'PENDING' }), take: 5 }));
    expect(cards).toHaveLength(3);
    expect(json(cards[0])).toContain('Prikazano 2 od 7.');
    expect(delivery.buildForKind).toHaveBeenCalledWith('ticket', 't5', 'ticket.approval', 'personal', 'bs', config);
  });

  it('status: incidents and planned maintenance', async () => {
    const out = json(await querySetup({ role: 'USER' }).ask('status'));
    expect(out).toContain('Prekid e-pošte');
    expect(out).toContain('ERP');
    expect(out).toContain('https://desk.example.com/status');
  });

  it('agent commands are refused for users', async () => {
    const { ask, tickets } = querySetup({ role: 'USER' });
    for (const command of ['dodijeljeni', 'red', 'sla', 'cab', 'dežurni']) expect(json(await ask(command))).toContain('samo agentima');
    expect(tickets.listPage).not.toHaveBeenCalled();
  });

  it('assigned sorts by SLA deadline; queue falls back when the group inbox is off', async () => {
    const { ask, tickets } = querySetup();
    await ask('dodijeljeni');
    expect(tickets.listPage).toHaveBeenCalledWith(expect.objectContaining({ assignedUserId: 'me', sort: 'slaDueAt', dir: 'asc', pageSize: 10 }), expect.anything());
    expect(json(await ask('red'))).toContain('Prikazano 1 od 4.');
    const off = querySetup({ inboxDisabled: true });
    expect(json(await off.ask('red'))).toContain('HD-u1');
    expect(off.tickets.listPage).toHaveBeenCalledWith(expect.objectContaining({ unassigned: true }), expect.anything());
  });

  it('sla lists only at-risk/breached tickets, breached first', async () => {
    const out = json(await querySetup().ask('sla'));
    expect(out).not.toContain('HD-a2');
    const order = ['HD-a3', 'HD-q1', 'HD-a1'].map((number) => out.indexOf(number));
    expect(order.every((index) => index > 0)).toBe(true);
    expect(order[2]).toBeGreaterThan(order[0]);
    expect(order[2]).toBeGreaterThan(order[1]);
  });

  it('cab uses awaitingMyVote and the CAB vote cards; off without the change module', async () => {
    const { ask, changes, delivery } = querySetup();
    expect(await ask('cab')).toHaveLength(3);
    expect(changes.list).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ awaitingMyVote: true }));
    expect(delivery.buildForKind).toHaveBeenCalledWith('change', 'c1', 'change.vote', 'personal', 'bs', config);
    expect(json(await querySetup({ changes: false }).ask('cab'))).toContain('nije aktivno');
  });

  it('on-call needs oncall.read', async () => {
    const allowed = json(await querySetup({ onCallRead: true }).ask('dežurni'));
    expect(allowed).toContain('Edin');
    expect(allowed).toContain('Vaše sljedeće dežurstvo');
    expect(json(await querySetup({ onCallRead: false }).ask('dežurni'))).toContain('nisu dostupna');
  });

  it('audience drives the help text', async () => {
    expect(await querySetup({ role: 'USER' }).service.audience('me')).toEqual({ isStaff: false, cab: false, onCall: false });
    expect(await querySetup({ onCallRead: true }).service.audience('me')).toEqual({ isStaff: true, cab: true, onCall: true });
  });
});

describe('router with query handler', () => {
  function setup(audience: { isStaff: boolean; cab: boolean; onCall: boolean }, answer: Record<string, unknown>[] | null = [{ type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'odgovor' }] }]) {
    const conversations = { touch: jest.fn(async () => ({ id: 'tc', conversationId: 'conv-1', kind: 'PERSONAL', serviceUrl: simulatorServiceUrl, userId: 'u1' })), markRemoved: jest.fn() };
    const identity = { resolveUser: jest.fn(async () => ({ id: 'u1', displayName: 'Ana', locale: 'bs' as const })), linkableGroups: jest.fn(async () => []) };
    const router = new TeamsActivityRouter({} as never, conversations as never, identity as never);
    const handler: TeamsQueryHandler = { audience: jest.fn(async () => audience), answer: jest.fn(async () => answer) };
    router.registerQueryHandler(handler);
    const outbox = new InMemoryTeamsSimulatorOutbox();
    const transport = new SimulatorTeamsTransport(outbox, () => 'x');
    const send = (text: string) =>
      router.route(
        parseTeamsActivity({ type: 'message', id: `a-${text}`, serviceUrl: simulatorServiceUrl, text, from: { id: '29:u', aadObjectId: 'aad' }, recipient: { id: 'bot' }, conversation: { id: 'conv-1', conversationType: 'personal', tenantId: simulatorTenantId } })!,
        config,
        transport,
      );
    return { send, outbox, handler };
  }

  it('help lists agent commands only for agents (cab / on-call by audience)', async () => {
    const user = setup({ isStaff: false, cab: true, onCall: true });
    await user.send('pomoć');
    const userHelp = json(user.outbox.entries[0]?.activity);
    expect(userHelp).toContain('traži');
    expect(userHelp).not.toContain('dodijeljeni');
    const agent = setup({ isStaff: true, cab: false, onCall: true });
    await agent.send('pomoć');
    const agentHelp = json(agent.outbox.entries[0]?.activity);
    expect(agentHelp).toContain('dodijeljeni');
    expect(agentHelp).toContain('dežurni');
    expect(agentHelp).not.toContain('**cab**');
  });

  it('sends every card of the answer; null falls back to help', async () => {
    const two = setup({ isStaff: false, cab: false, onCall: false }, [{ type: 'AdaptiveCard', body: [] }, { type: 'AdaptiveCard', body: [] }]);
    await two.send('odobrenja');
    expect(two.outbox.entries).toHaveLength(2);
    const none = setup({ isStaff: false, cab: false, onCall: false }, null);
    await none.send('HD-9');
    expect(json(none.outbox.entries[0]?.activity)).toContain('Šta mogu uraditi');
  });
});

describe('manifest command lists', () => {
  it('has 10 personal commands and a team list, all within limits', () => {
    const manifest = buildTeamsManifest({ botAppId: '11111111-1111-4111-8111-111111111111', appName: 'Desk', publicUrl: 'https://desk.example.com', locale: 'bs', version: '1.0.0' } as never);
    const bots = manifest.bots as { commandLists: { scopes: string[]; commands: unknown[] }[] }[];
    const lists = bots[0].commandLists;
    expect(lists.find((list) => list.scopes.includes('personal'))?.commands).toHaveLength(10);
    expect(lists.find((list) => list.scopes.includes('team'))?.commands.length).toBeGreaterThan(0);
    expect(validateTeamsManifest(manifest)).toEqual([]);
  });
});
