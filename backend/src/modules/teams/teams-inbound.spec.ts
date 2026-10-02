import { InMemoryTeamsSimulatorOutbox, SimulatorTeamsTransport, simulatorServiceUrl } from './simulator-teams-transport';
import { signSimulatorActivity } from './simulator-signature';
import { parseTeamsActivity, readCardAction } from './teams-activity';
import { TeamsActivityRouter } from './teams-activity-router.service';
import { normalizeCommandText, parseTeamsCommand } from './teams-commands';
import type { TeamsConfiguration } from './teams-configuration.service';
import { simulatorTenantId, teamsVerbs } from './teams.constants';
import { TeamsConversationsService } from './teams-conversations.service';
import { TeamsInboundService } from './teams-inbound.service';

const secret = 's'.repeat(40);

function config(overrides: Partial<TeamsConfiguration> = {}): TeamsConfiguration {
  return {
    mode: 'simulator',
    configuredMode: 'simulator',
    addonEnabled: true,
    simulatorSecretConfigured: true,
    tenantId: '',
    botAppId: '',
    personalEnabled: true,
    channelEnabled: true,
    channelIncludeTitle: false,
    ticketCreateEnabled: true,
    actionsEnabled: true,
    appName: 'Desk',
    publicUrl: 'https://desk.example.com',
    defaultLocale: 'bs',
    ...overrides,
  };
}

function activity(overrides: Record<string, unknown> = {}) {
  return {
    type: 'message',
    id: 'act-1',
    serviceUrl: simulatorServiceUrl,
    text: 'pomoć',
    from: { id: '29:u', aadObjectId: 'aad-1', name: 'Ana' },
    recipient: { id: '28:bot' },
    conversation: { id: 'conv-1', conversationType: 'personal', tenantId: simulatorTenantId },
    channelData: { tenant: { id: simulatorTenantId } },
    ...overrides,
  };
}

describe('teams commands', () => {
  it('normalises mentions, markup and diacritics', () => {
    expect(normalizeCommandText('<at>Desk</at> Poveži&nbsp;')).toBe('povezi');
    expect(parseTeamsCommand('Pomoć')).toBe('help');
    expect(parseTeamsCommand('NOVI   tiket')).toBe('newTicket');
    expect(parseTeamsCommand('my tickets')).toBe('myTickets');
    expect(parseTeamsCommand('<at>bot</at> odspoji')).toBe('unlink');
    expect(parseTeamsCommand('zdravo')).toBe('unknown');
  });
});

describe('parseTeamsActivity', () => {
  it('accepts a minimal activity and rejects payloads without an address', () => {
    expect(parseTeamsActivity(activity())?.conversation.id).toBe('conv-1');
    expect(parseTeamsActivity({ type: 'message' })).toBeNull();
    expect(parseTeamsActivity(null)).toBeNull();
  });
  it('reads Universal Action invokes', () => {
    const parsed = parseTeamsActivity(activity({ type: 'invoke', name: 'adaptiveCard/action', value: { action: { type: 'Action.Execute', verb: 'x', data: { a: 1 } } } }));
    expect(parsed && readCardAction(parsed)).toEqual({ verb: 'x', data: { a: 1 } });
  });
});

function routerSetup(options: { user?: boolean; kind?: 'PERSONAL' | 'CHANNEL'; groups?: { id: string; name: string }[] } = {}) {
  const prisma = {
    ticket: { findMany: jest.fn(async () => [{ id: 't1', ticketNumber: 'HD-1', title: 'Štampač *ne radi*', status: 'IN_PROGRESS' }]) },
    teamsGroupChannel: { upsert: jest.fn(async () => ({})), deleteMany: jest.fn(async () => ({ count: 1 })) },
  };
  const conversations = {
    touch: jest.fn(async () => ({ id: 'tc1', conversationId: 'conv-1', kind: options.kind ?? 'PERSONAL', serviceUrl: simulatorServiceUrl, userId: 'u1' })),
    markRemoved: jest.fn(async () => undefined),
  };
  const identity = {
    resolveUser: jest.fn(async () => (options.user === false ? null : { id: 'u1', displayName: 'Ana', locale: 'bs' as const })),
    linkableGroups: jest.fn(async () => options.groups ?? [{ id: 'g1', name: 'IT podrška' }]),
  };
  const router = new TeamsActivityRouter(prisma as never, conversations as never, identity as never);
  const outbox = new InMemoryTeamsSimulatorOutbox();
  const transport = new SimulatorTeamsTransport(outbox, () => 'x');
  return { router, prisma, conversations, identity, outbox, transport };
}

const firstCard = (outbox: InMemoryTeamsSimulatorOutbox) => JSON.stringify(outbox.entries[0]?.activity.attachments?.[0]?.content ?? {});

describe('TeamsActivityRouter', () => {
  it('greets on personal install and marks removal', async () => {
    const { router, outbox, transport, conversations } = routerSetup();
    await router.route(parseTeamsActivity(activity({ type: 'installationUpdate', action: 'add' }))!, config(), transport);
    expect(firstCard(outbox)).toContain('Dobro došli u Desk');
    await router.route(parseTeamsActivity(activity({ type: 'installationUpdate', action: 'remove' }))!, config(), transport);
    expect(conversations.markRemoved).toHaveBeenCalledWith('conv-1');
  });

  it('answers unlinked users without any data', async () => {
    const { router, outbox, transport, prisma } = routerSetup({ user: false });
    await router.route(parseTeamsActivity(activity({ text: 'moji tiketi' }))!, config(), transport);
    expect(firstCard(outbox)).toContain('nije povezan');
    expect(prisma.ticket.findMany).not.toHaveBeenCalled();
  });

  it('lists my open tickets with escaped titles and localised status', async () => {
    const { router, outbox, transport, prisma } = routerSetup();
    await router.route(parseTeamsActivity(activity({ text: 'moji tiketi' }))!, config(), transport);
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ requesterId: 'u1' }), take: 5 }));
    const card = firstCard(outbox);
    expect(card).toContain('\\\\*ne radi\\\\*');
    expect(card).toContain('U radu');
    expect(card).toContain('https://desk.example.com/tickets/t1');
  });

  it('shows help for free text and ignores channel chatter', async () => {
    const personal = routerSetup();
    await personal.router.route(parseTeamsActivity(activity({ text: 'zdravo' }))!, config(), personal.transport);
    expect(firstCard(personal.outbox)).toContain('Šta mogu uraditi');
    const channel = routerSetup({ kind: 'CHANNEL' });
    await channel.router.route(parseTeamsActivity(activity({ text: 'zdravo', conversation: { id: 'conv-1', conversationType: 'channel' } }))!, config(), channel.transport);
    expect(channel.outbox.entries).toHaveLength(0);
  });

  it('links a channel to a group the user may manage and refuses others', async () => {
    const { router, outbox, transport, prisma } = routerSetup({ kind: 'CHANNEL' });
    const channelActivity = (extra: Record<string, unknown>) => parseTeamsActivity(activity({ conversation: { id: 'conv-1', conversationType: 'channel' }, ...extra }))!;
    await router.route(channelActivity({ text: '<at>Desk</at> poveži' }), config(), transport);
    expect(firstCard(outbox)).toContain(teamsVerbs.linkGroup);
    const ok = await router.route(channelActivity({ type: 'invoke', name: 'adaptiveCard/action', id: 'a2', value: { action: { verb: teamsVerbs.linkGroup, data: { groupId: 'g1' } } } }), config(), transport);
    expect(JSON.stringify(ok)).toContain('IT podrška');
    expect(prisma.teamsGroupChannel.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ groupId: 'g1', events: ['ticket.created_in_group', 'sla.breached'], includeTitle: false }) }));
    const denied = await router.route(channelActivity({ type: 'invoke', name: 'adaptiveCard/action', id: 'a3', value: { action: { verb: teamsVerbs.linkGroup, data: { groupId: 'other' } } } }), config(), transport);
    expect(JSON.stringify(denied)).toContain('Nemate pravo');
    expect(prisma.teamsGroupChannel.upsert).toHaveBeenCalledTimes(1);
  });

  it('answers unknown verbs with a friendly card', async () => {
    const { router, transport } = routerSetup();
    const response = await router.route(parseTeamsActivity(activity({ type: 'invoke', name: 'adaptiveCard/action', value: { action: { verb: 'ticket.claim', data: {} } } }))!, config(), transport);
    expect(response?.body).toMatchObject({ statusCode: 200, type: 'application/vnd.microsoft.card.adaptive' });
  });
});

describe('TeamsInboundService', () => {
  const originalSecret = process.env.TEAMS_SIMULATOR_SECRET;
  beforeAll(() => {
    process.env.TEAMS_SIMULATOR_SECRET = secret;
  });
  afterAll(() => {
    process.env.TEAMS_SIMULATOR_SECRET = originalSecret;
  });

  function setup(cfg: TeamsConfiguration, claimed = true) {
    const router = { route: jest.fn(async () => null) };
    const conversations = { claimActivity: jest.fn(async () => claimed) } as unknown as TeamsConversationsService;
    const outbox = { recordInbound: jest.fn(async () => undefined) };
    const transports = { forMode: jest.fn(async () => ({})), fetch: jest.fn() };
    const service = new TeamsInboundService({ load: async () => cfg } as never, transports as never, conversations, router as never, outbox as never);
    return { service, router, outbox };
  }

  function signed(body: unknown) {
    const raw = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    return { body, rawBody: raw, headers: { 'x-teams-simulator-timestamp': timestamp, 'x-teams-simulator-signature': signSimulatorActivity(secret, timestamp, raw) } };
  }

  it('is 404 when the connector is off', async () => {
    expect((await setup(config({ mode: 'off' })).service.handle(signed(activity()))).status).toBe(404);
  });

  it('routes a signed simulator activity once', async () => {
    const { service, router, outbox } = setup(config());
    expect((await service.handle(signed(activity()))).status).toBe(200);
    expect(router.route).toHaveBeenCalledTimes(1);
    expect(outbox.recordInbound).toHaveBeenCalled();
    const duplicate = setup(config(), false);
    expect((await duplicate.service.handle(signed(activity()))).status).toBe(200);
    expect(duplicate.router.route).not.toHaveBeenCalled();
  });

  it('rejects bad signatures, foreign tenants and malformed bodies', async () => {
    const { service, router } = setup(config());
    const request = signed(activity());
    expect((await service.handle({ ...request, rawBody: request.rawBody + ' ' })).status).toBe(401);
    expect((await service.handle(signed(activity({ channelData: { tenant: { id: 'other' } }, conversation: { id: 'c', tenantId: 'other' } })))).status).toBe(403);
    expect((await service.handle(signed({ hello: 'world' }))).status).toBe(400);
    expect((await service.handle(signed(activity({ serviceUrl: 'https://smba.trafficmanager.net/emea/' })))).status).toBe(400);
    expect(router.route).not.toHaveBeenCalled();
  });

  it('requires credentials and a bearer token in live mode', async () => {
    expect((await setup(config({ mode: 'live' })).service.handle(signed(activity()))).status).toBe(503);
    const live = setup(config({ mode: 'live', botAppId: '22222222-2222-2222-2222-222222222222', tenantId: '11111111-1111-1111-1111-111111111111' }));
    expect((await live.service.handle({ body: activity(), rawBody: '', headers: {} })).status).toBe(401);
  });
});
