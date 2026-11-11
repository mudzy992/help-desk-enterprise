import { channelEventOf } from './teams-channel-events';
import { InMemoryTeamsSimulatorOutbox, SimulatorTeamsTransport } from './simulator-teams-transport';
import { TeamsDeliveryService } from './teams-delivery.service';
import { parseTeamsDeliveryJob } from './teams-delivery.types';
import { TeamsError } from './teams.error';
import { buildNotificationCard, type NotificationCardInput, type TicketCardFacts } from './teams-notification-cards';
import { TeamsNotificationPlanner } from './teams-notification-planner.service';
import { TeamsRateLimiter } from './teams-rate-limiter';

const ticket: TicketCardFacts = {
  id: 't1',
  number: 'HD-000123',
  title: 'VPN ne radi',
  status: 'ASSIGNED',
  priority: 'HIGH',
  serviceName: 'Mreža',
  assigneeName: null,
  dueAt: new Date('2026-10-05T10:00:00Z'),
  isConfidential: false,
};

function input(overrides: Partial<NotificationCardInput> = {}): NotificationCardInput {
  return {
    target: 'personal',
    locale: 'bs',
    timeZone: 'Europe/Sarajevo',
    notificationType: 'ticket.assigned',
    event: '',
    body: 'Korisnik je napisao: lozinka je 1234',
    ticket,
    change: null,
    other: null,
    includeTitle: false,
    actionsEnabled: true,
    publicUrl: 'https://desk.example.com',
    ...overrides,
  };
}

const json = (value: unknown) => JSON.stringify(value);

describe('buildNotificationCard', () => {
  it('channel cards hide title and message, offer claim only when unassigned', () => {
    const card = buildNotificationCard(input({ target: 'channel', notificationType: 'ticket.created' }))!;
    expect(card.cardKind).toBe('channel.ticket');
    expect(json(card.card)).not.toContain('VPN ne radi');
    expect(json(card.card)).not.toContain('lozinka');
    expect(json(card.card)).toContain('ticket.claim');
    const titled = buildNotificationCard(input({ target: 'channel', notificationType: 'ticket.created', includeTitle: true, ticket: { ...ticket, assigneeName: 'Ana' } }))!;
    expect(json(titled.card)).toContain('VPN ne radi');
    expect(json(titled.card)).not.toContain('ticket.claim');
    const confidential = buildNotificationCard(input({ target: 'channel', notificationType: 'ticket.created', includeTitle: true, ticket: { ...ticket, isConfidential: true } }))!;
    expect(json(confidential.card)).not.toContain('VPN ne radi');
  });

  it('personal agent cards offer reply and internal note; requester messages show a snippet only when not confidential', () => {
    const assigned = buildNotificationCard(input())!;
    expect(json(assigned.card)).toContain('ticket.reply');
    expect(json(assigned.card)).toContain('ticket.note');
    const message = buildNotificationCard(input({ notificationType: 'ticket.message' }))!;
    expect(json(message.card)).toContain('lozinka');
    expect(json(message.card)).not.toContain('ticket.note');
    const secret = buildNotificationCard(input({ notificationType: 'ticket.message', ticket: { ...ticket, isConfidential: true } }))!;
    expect(json(secret.card)).not.toContain('lozinka');
  });

  it('approval cards carry approve/reject only while pending; actionsEnabled=false leaves links only', () => {
    const pending = buildNotificationCard(input({ notificationType: 'ticket.approval', event: 'ticket_approval_requested', ticket: { ...ticket, status: 'PENDING_APPROVAL' } }))!;
    expect(pending.cardKind).toBe('ticket.approval');
    expect(json(pending.card)).toContain('approval.approve');
    expect(json(pending.card)).toContain('"isRequired":true');
    const decided = buildNotificationCard(input({ notificationType: 'ticket.approval', event: 'ticket_approval_requested', ticket: { ...ticket, status: 'ASSIGNED' } }))!;
    expect(json(decided.card)).not.toContain('approval.approve');
    expect(decided.stateHash).not.toBe(pending.stateHash);
    const linksOnly = buildNotificationCard(input({ actionsEnabled: false }))!;
    expect(json(linksOnly.card)).not.toContain('Action.Execute');
    expect(json(linksOnly.card)).toContain('https://desk.example.com/tickets/t1');
  });

  it('CAB vote cards and English texts', () => {
    const card = buildNotificationCard(
      input({
        locale: 'en',
        notificationType: 'change.approvalRequested',
        ticket: null,
        change: { id: 'c1', number: 'CHG-000007', title: 'Firewall', risk: 'HIGH', status: 'AUTHORIZATION', plannedStart: new Date('2026-10-10T20:00:00Z'), plannedEnd: null, version: 3 },
      }),
    )!;
    expect(card.cardKind).toBe('change.vote');
    expect(json(card.card)).toContain('Your CAB vote is requested');
    expect(json(card.card)).toContain('change.approve');
    expect(json(card.card)).toContain('/changes/c1');
  });

  it('escapes markdown in user text', () => {
    const card = buildNotificationCard(input({ ticket: { ...ticket, title: '[klik](https://evil.example.com)' } }))!;
    expect(json(card.card)).toContain('\\\\[klik\\\\]\\\\(https://evil.example.com\\\\)');
  });
});

describe('channelEventOf / parseTeamsDeliveryJob', () => {
  it('maps group notifications to channel events', () => {
    expect(channelEventOf('ticket.created', '')).toBe('ticket.created_in_group');
    expect(channelEventOf('ticket.forwarded', '')).toBe('ticket.assigned_in_group');
    expect(channelEventOf('ticket.sla', 'ticket_sla_resolution_breached')).toBe('sla.breached');
    expect(channelEventOf('ticket.sla', 'ticket_sla_response_at_risk')).toBe('sla.warning');
    expect(channelEventOf('ticket.message', '')).toBeNull();
  });
  it('validates job payloads', () => {
    expect(parseTeamsDeliveryJob({ target: 'personal', teamsConversationId: 'c', notificationId: 'n', userId: 'u' })).toMatchObject({ userId: 'u' });
    expect(parseTeamsDeliveryJob({ target: 'x', teamsConversationId: 'c', notificationId: 'n' })).toBeNull();
  });
});

describe('TeamsRateLimiter', () => {
  it('spaces messages per conversation', async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = new TeamsRateLimiter(1_000, 40, () => now, async (ms) => {
      waits.push(ms);
      now += ms;
    });
    await limiter.acquire('a');
    await limiter.acquire('b');
    await limiter.acquire('a');
    expect(waits).toEqual([1_000]);
  });
});

const baseConfig = {
  mode: 'simulator' as const,
  personalEnabled: true,
  channelEnabled: true,
  channelIncludeTitle: false,
  actionsEnabled: true,
  publicUrl: 'https://desk.example.com',
  defaultLocale: 'bs' as const,
};

describe('TeamsNotificationPlanner', () => {
  function setup(options: { teams?: boolean | null; quiet?: boolean; link?: string[]; queue?: boolean } = {}) {
    const prisma = {
      teamsConversation: { findMany: jest.fn(async () => [{ id: 'conv-u1', userId: 'u1' }]) },
      userNotificationPreference: { findMany: jest.fn(async () => (options.teams === undefined ? [] : [{ userId: 'u1', teams: options.teams }])) },
      userNotificationSchedule: {
        findMany: jest.fn(async () => (options.quiet ? [{ userId: 'u1', quietHoursEnabled: true, quietStartMinute: 0, quietEndMinute: 1439, quietWeekends: true }] : [])),
      },
      onCallShift: { findMany: jest.fn(async () => []) },
      teamsGroupChannel: { findMany: jest.fn(async () => (options.link ? [{ groupId: 'g1', teamsConversationId: 'conv-ch', events: options.link }] : [])) },
    };
    const settingsValues: Record<string, unknown> = {
      'private.integrations.queue.enabled': options.queue === true,
      'private.integrations.queue.typesCsv': 'teams',
      'private.notifications.preferences.enabled': true,
      'private.notifications.quietHours.enabled': true,
    };
    const settings = { getSetting: jest.fn(async (key: string) => settingsValues[key]) };
    const enqueue = { enqueue: jest.fn(async () => ({})) };
    const delivery = { deliver: jest.fn(async () => 'sent'), refreshEntityCards: jest.fn(async () => 0) };
    const planner = new TeamsNotificationPlanner(prisma as never, settings as never, { load: async () => baseConfig } as never, enqueue as never, delivery as never);
    return { planner, delivery, enqueue };
  }
  const personal = (type: string) => ({ id: 'n1', userId: 'u1', groupId: null, type, title: '', body: null, isRead: false, readAt: null, ticketId: 't1', payload: { event: '' }, dedupeKey: 'd', createdAt: new Date() });
  const group = (type: string, event = '') => ({ ...personal(type), id: 'n2', userId: null, groupId: 'g1', payload: { event } });

  it('approvals go to Teams by default; other categories only when opted in', async () => {
    const approval = setup();
    expect(await approval.planner.plan([personal('ticket.approval')])).toBe(1);
    expect(approval.delivery.deliver).toHaveBeenCalledWith({ target: 'personal', teamsConversationId: 'conv-u1', notificationId: 'n1', userId: 'u1' });
    expect(await setup().planner.plan([personal('ticket.assigned')])).toBe(0);
    expect(await setup({ teams: true }).planner.plan([personal('ticket.assigned')])).toBe(1);
    expect(await setup({ teams: false }).planner.plan([personal('ticket.approval')])).toBe(0);
    expect(await setup().planner.plan([personal('account.newDevice')])).toBe(0);
  });

  it('channel deliveries follow the link event list', async () => {
    expect(await setup({ link: ['ticket.created_in_group'] }).planner.plan([group('ticket.created')])).toBe(1);
    expect(await setup({ link: ['sla.breached'] }).planner.plan([group('ticket.created')])).toBe(0);
    expect(await setup({ link: ['sla.breached'] }).planner.plan([group('ticket.sla', 'ticket_sla_resolution_breached')])).toBe(1);
  });
});

describe('TeamsDeliveryService', () => {
  function setup(options: { existing?: { id: string; activityId: string; stateHash: string } | null; transportError?: Error; conversationMode?: 'SIMULATOR' | 'LIVE' } = {}) {
    const outbox = new InMemoryTeamsSimulatorOutbox();
    const transport = new SimulatorTeamsTransport(outbox, () => 'a1');
    if (options.transportError) jest.spyOn(transport, 'sendActivity').mockRejectedValue(options.transportError);
    const prisma = {
      teamsConversation: {
        findUnique: jest.fn(async () => ({ id: 'tc', conversationId: 'conv', serviceUrl: 'simulator://teams', removedAt: null, userId: 'u1', mode: options.conversationMode ?? 'SIMULATOR' })),
        update: jest.fn(async () => ({})),
      },
      notification: { findUnique: jest.fn(async () => ({ type: 'ticket.approval', body: null, ticketId: 't1', payload: { event: 'ticket_approval_requested' } })) },
      user: { findUnique: jest.fn(async () => ({ preferredLocale: 'en' })) },
      ticket: {
        findUnique: jest.fn(async () => ({ id: 't1', ticketNumber: 'HD-1', title: 'T', status: 'PENDING_APPROVAL', priority: 'LOW', dueAt: null, isConfidential: false, service: { name: 'S' }, assignedUser: null })),
      },
      teamsCardMessage: {
        findUnique: jest.fn(async () => options.existing ?? null),
        upsert: jest.fn(async () => ({})),
        update: jest.fn(async () => ({})),
      },
      teamsGroupChannel: { findUnique: jest.fn(async () => null) },
    };
    const settings = { getSetting: jest.fn(async () => 'Europe/Sarajevo') };
    const service = new TeamsDeliveryService(prisma as never, settings as never, { load: async () => baseConfig } as never, { forMode: async () => transport } as never);
    return { service, prisma, outbox };
  }
  const job = { target: 'personal' as const, teamsConversationId: 'tc', notificationId: 'n1', userId: 'u1' };

  it('sends a new card in the user language and records it', async () => {
    const { service, prisma, outbox } = setup();
    expect(await service.deliver(job)).toBe('sent');
    expect(JSON.stringify(outbox.entries[0].activity)).toContain('Approve');
    expect(prisma.teamsCardMessage.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ activityId: 'sim-activity:a1', cardKind: 'ticket.approval' }) }));
  });

  it('updates an existing card and skips identical ones', async () => {
    const changed = setup({ existing: { id: 'm1', activityId: 'old', stateHash: 'different' } });
    expect(await changed.service.deliver(job)).toBe('updated');
    expect(changed.outbox.entries[0]).toMatchObject({ operation: 'update', activityId: 'old' });
    const first = setup();
    await first.service.deliver(job);
    const hash = (first.prisma.teamsCardMessage.upsert.mock.calls[0] as unknown as [{ create: { stateHash: string } }])[0].create.stateHash;
    expect(await setup({ existing: { id: 'm1', activityId: 'old', stateHash: hash } }).service.deliver(job)).toBe('unchanged');
  });

  it('marks gone conversations, skips other users and other modes, rethrows transient errors', async () => {
    const gone = setup({ transportError: new TeamsError('CONVERSATION_GONE') });
    expect(await gone.service.deliver(job)).toBe('gone');
    expect(gone.prisma.teamsConversation.update).toHaveBeenCalled();
    expect(await setup().service.deliver({ ...job, userId: 'someone-else' })).toBe('skipped');
    expect(await setup({ conversationMode: 'LIVE' }).service.deliver(job)).toBe('skipped');
    await expect(setup({ transportError: new TeamsError('THROTTLED', 'x', 3) }).service.deliver(job)).rejects.toMatchObject({ code: 'THROTTLED' });
  });
});
