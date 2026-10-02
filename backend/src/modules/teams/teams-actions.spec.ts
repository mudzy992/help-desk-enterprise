import { ChangeError } from '../changes/changes.constants';
import { TicketsError } from '../tickets/tickets.error';
import { teamsErrorTextKey } from './teams-action-errors';
import { parseTeamsActivity } from './teams-activity';
import { TeamsActionsService } from './teams-actions.service';
import type { TeamsConfiguration } from './teams-configuration.service';
import { teamsVerbs } from './teams.constants';
import { messagePayloadText, readTicketDraft, ticketFormCard } from './teams-ticket-create';

const config = {
  mode: 'simulator',
  actionsEnabled: true,
  ticketCreateEnabled: true,
  publicUrl: 'https://desk.example.com',
  defaultLocale: 'bs',
} as unknown as TeamsConfiguration;

const user = { id: 'u1', displayName: 'Ana', locale: 'bs' as const };
const activity = parseTeamsActivity({
  type: 'invoke',
  name: 'adaptiveCard/action',
  id: 'act-9',
  serviceUrl: 'simulator://teams',
  from: { aadObjectId: 'aad' },
  recipient: { id: 'bot' },
  conversation: { id: 'c1', conversationType: 'personal' },
})!;

function setup(options: { assigned?: string | null; approval?: boolean; formSchema?: unknown; claimError?: Error; intercept?: boolean; articles?: number; unitId?: string | null } = {}) {
  const prisma = {
    ticket: { findUnique: jest.fn(async () => ({ assignedUserId: options.assigned ?? null })) },
    user: { findUnique: jest.fn(async () => ({ organizationalUnitId: options.unitId === undefined ? 'ou1' : options.unitId })) },
    ticketApproval: { findFirst: jest.fn(async () => (options.approval === false ? null : { id: 'ap1' })) },
    service: {
      findMany: jest.fn(async () => [
        { id: 's1', name: 'Mreža', lifecycle: 'ACTIVE', formVersions: [] },
        { id: 's2', name: 'Nabavka', lifecycle: 'ACTIVE', formVersions: [{ schema: options.formSchema ?? { schemaVersion: 1, fields: [{ id: 'f', label: 'F', type: 'text', required: true, order: 1 }] } }] },
        { id: 's3', name: 'Stari', lifecycle: 'RETIRED', formVersions: [] },
      ]),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ $executeRaw: jest.fn(), auditLog: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) } })),
  };
  const tickets = {
    claim: jest.fn(async () => (options.claimError ? Promise.reject(options.claimError) : {})),
    create: jest.fn(async () => ({ id: 't9', ticketNumber: 'HD-000009', title: 'Novi' })),
  };
  const collaboration = { createMessage: jest.fn(async () => ({ id: 'm1' })) };
  const approvals = { approve: jest.fn(async () => ({})), reject: jest.fn(async () => ({})) };
  const changeApprovals = { vote: jest.fn(async () => ({})) };
  const delivery = {
    buildForKind: jest.fn(async () => ({ card: { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'HD-1' }] } })),
    refreshEntityCards: jest.fn(async () => 0),
  };
  const principals = { load: jest.fn(async () => ({ roleKeys: [], assignments: [{ roleKey: 'AGENT', permissionKeys: ['change.approve'], organizationalUnitPath: null }] })) };
  const router = { registerActionHandler: jest.fn() };
  const knowledge = {
    intercept: jest.fn(async () => ({
      articles: Array.from({ length: options.articles ?? 0 }, (_, index) => ({ id: `a${index + 1}`, slug: `clanak-${index + 1}`, title: `Članak ${index + 1}`, bodyPreview: 'Restartujte VPN klijent.', isStale: false, score: 1, viewerFeedback: null })),
    })),
    resolveIntercept: jest.fn(async () => ({ id: 'r1' })),
  };
  const settings = { getSetting: jest.fn(async (key: string) => (key.endsWith('kbIntercept') ? (options.intercept ?? false) : 'Europe/Sarajevo')) };
  const service = new TeamsActionsService(
    prisma as never,
    router as never,
    principals as never,
    tickets as never,
    collaboration as never,
    approvals as never,
    changeApprovals as never,
    delivery as never,
    knowledge as never,
    settings as never,
  );
  const run = (verb: string, data: Record<string, unknown>, cfg = config) => service.handle({ verb, data, user, activity, config: cfg });
  return { service, run, prisma, tickets, collaboration, approvals, changeApprovals, delivery, knowledge };
}

const json = (value: unknown) => JSON.stringify(value);

describe('TeamsActionsService', () => {
  it('claims as the linked user and audits with channel=teams', async () => {
    const { run, tickets, prisma } = setup();
    const card = await run(teamsVerbs.claimTicket, { ticketId: 't1', cardKind: 'channel.ticket' });
    expect(tickets.claim).toHaveBeenCalledWith('t1', { actorUserId: 'u1', messageSource: 'TEAMS' });
    expect(json(card)).toContain('Tiket je preuzet');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('does not claim an already assigned ticket', async () => {
    const { run, tickets } = setup({ assigned: 'u2' });
    expect(json(await run(teamsVerbs.claimTicket, { ticketId: 't1' }))).toContain('U međuvremenu');
    expect(tickets.claim).not.toHaveBeenCalled();
  });

  it('maps domain refusals to readable banners', async () => {
    const { run } = setup({ claimError: new TicketsError('FORBIDDEN' as never) });
    expect(json(await run(teamsVerbs.claimTicket, { ticketId: 't1' }))).toContain('Nemate pravo');
  });

  it('replies and notes with length limits', async () => {
    const { run, collaboration } = setup();
    expect(json(await run(teamsVerbs.replyTicket, { ticketId: 't1', text: 'x' }))).toContain('od 2 do 4000');
    await run(teamsVerbs.replyTicket, { ticketId: 't1', text: 'Provjerite kabl.' });
    await run(teamsVerbs.noteTicket, { ticketId: 't1', text: 'Interno' });
    expect(collaboration.createMessage).toHaveBeenNthCalledWith(1, 't1', { type: 'AGENT_REPLY', body: 'Provjerite kabl.' }, expect.objectContaining({ messageSource: 'TEAMS' }));
    expect(collaboration.createMessage).toHaveBeenNthCalledWith(2, 't1', { type: 'INTERNAL_NOTE', body: 'Interno' }, expect.anything());
  });

  describe('knowledge intercept (§20b.2)', () => {
    const draft = { serviceId: 's1', title: 'VPN ne radi', description: 'Ne mogu se spojiti.', impact: 'LOW', urgency: 'LOW' };

    it('labels the form button „Dalje“ only with the intercept on', async () => {
      expect(json(await setup({ intercept: true }).service.ticketForm('bs', config))).toContain('"title":"Dalje"');
      expect(json(await setup({ intercept: false }).service.ticketForm('bs', config))).toContain('"title":"Kreiraj tiket"');
    });

    it('shows up to 3 articles with „Riješeno“ and „Ipak kreiraj“ instead of creating', async () => {
      const { run, tickets, knowledge } = setup({ intercept: true, articles: 5 });
      const card = json(await run(teamsVerbs.createTicket, draft));
      expect(knowledge.intercept).toHaveBeenCalledWith({ serviceId: 's1', query: 'VPN ne radi Ne mogu se spojiti.' }, { actorUserId: 'u1' });
      expect(tickets.create).not.toHaveBeenCalled();
      expect(card).toContain('Članak 3');
      expect(card).not.toContain('Članak 4');
      expect(card).toContain('Riješeno, ne treba tiket');
      expect(card).toContain('"verb":"ticket.deflect"');
      expect(card).toContain('"confirmed":true');
      expect(card).toContain('https://desk.example.com/knowledge-base/a1');
    });

    it('creates immediately without hits, with the intercept off, or when confirmed', async () => {
      for (const [options, data] of [
        [{ intercept: true, articles: 0 }, draft],
        [{ intercept: false, articles: 3 }, draft],
        [{ intercept: true, articles: 3 }, { ...draft, confirmed: true }],
      ] as const) {
        const { run, tickets } = setup(options);
        expect(json(await run(teamsVerbs.createTicket, data))).toContain('HD-000009');
        expect(tickets.create).toHaveBeenCalledTimes(1);
      }
    });

    it('a failing knowledge search never blocks the ticket', async () => {
      const { run, tickets, knowledge } = setup({ intercept: true, articles: 2 });
      knowledge.intercept.mockRejectedValueOnce(new Error('db down'));
      expect(json(await run(teamsVerbs.createTicket, draft))).toContain('HD-000009');
      expect(tickets.create).toHaveBeenCalled();
    });

    it('uses Action.Submit inside the message-action task module', async () => {
      const card = json(await setup({ intercept: true, articles: 1 }).run(teamsVerbs.createTicket, { ...draft, submitMode: 'submit' }));
      expect(card).toContain('"type":"Action.Submit"');
      expect(card).not.toContain('Action.Execute');
    });

    it('records the deflection with the user’s unit and the first article', async () => {
      const { run, knowledge, tickets } = setup();
      expect(json(await run(teamsVerbs.deflectTicket, { serviceId: 's1', articleId: 'a1' }))).toContain('Tiket nije kreiran');
      expect(knowledge.resolveIntercept).toHaveBeenCalledWith({ serviceId: 's1', organizationalUnitId: 'ou1', articleId: 'a1' }, { actorUserId: 'u1' });
      expect(tickets.create).not.toHaveBeenCalled();
      const noUnit = setup({ unitId: null });
      expect(json(await noUnit.run(teamsVerbs.deflectTicket, { serviceId: 's1' }))).toContain('Tiket nije kreiran');
      expect(noUnit.knowledge.resolveIntercept).not.toHaveBeenCalled();
    });
  });

  it('falls back to USER_REPLY for requesters', async () => {
    const { run, collaboration } = setup();
    collaboration.createMessage.mockRejectedValueOnce(new TicketsError('MESSAGE_TYPE_NOT_ALLOWED' as never));
    expect(json(await run(teamsVerbs.replyTicket, { ticketId: 't1', text: 'Hvala, radi.' }))).toContain('Odgovor je poslan');
    expect(collaboration.createMessage).toHaveBeenLastCalledWith('t1', { type: 'USER_REPLY', body: 'Hvala, radi.' }, expect.anything());
  });

  it('approves the caller’s pending approval; rejection needs a reason', async () => {
    const { run, approvals } = setup();
    await run(teamsVerbs.approveTicket, { ticketId: 't1' });
    expect(approvals.approve).toHaveBeenCalledWith('t1', 'ap1', { comment: '' }, expect.anything());
    expect(json(await run(teamsVerbs.rejectTicket, { ticketId: 't1', comment: '' }))).toContain('obavezan');
    await run(teamsVerbs.rejectTicket, { ticketId: 't1', comment: 'Nije budžetirano' });
    expect(approvals.reject).toHaveBeenCalledWith('t1', 'ap1', { comment: 'Nije budžetirano' }, expect.anything());
    expect(json(await setup({ approval: false }).run(teamsVerbs.approveTicket, { ticketId: 't1' }))).toContain('U međuvremenu');
  });

  it('votes on a change with its version', async () => {
    const { run, changeApprovals } = setup();
    await run(teamsVerbs.approveChange, { changeId: 'c1', version: 4 });
    expect(changeApprovals.vote).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }), 'c1', { version: 4, decision: 'APPROVED', comment: undefined });
    const stale = setup();
    stale.changeApprovals.vote.mockRejectedValueOnce(new ChangeError('CHANGE_VERSION_CONFLICT' as never));
    expect(json(await stale.run(teamsVerbs.rejectChange, { changeId: 'c1', version: 4, comment: 'Rizik' }))).toContain('U međuvremenu');
  });

  it('respects actionsEnabled=false', async () => {
    const { run, tickets } = setup();
    expect(json(await run(teamsVerbs.claimTicket, { ticketId: 't1' }, { ...config, actionsEnabled: false }))).toContain('nije dostupna');
    expect(tickets.claim).not.toHaveBeenCalled();
  });

  it('creates tickets only for offered services without required forms', async () => {
    const { run, service, tickets } = setup();
    const { choices, needsForm } = await service.creatableServices();
    expect(choices.map((choice) => choice.id)).toEqual(['s1']);
    expect([...needsForm]).toEqual(['s2']);
    const created = await run(teamsVerbs.createTicket, { serviceId: 's1', title: 'Novi', description: 'Opis', impact: 'HIGH', urgency: 'bogus' });
    expect(tickets.create).toHaveBeenCalledWith({ title: 'Novi', description: 'Opis', serviceId: 's1', impact: 'HIGH', urgency: 'MEDIUM' }, { actorUserId: 'u1', messageSource: 'TEAMS' });
    expect(json(created)).toContain('HD-000009');
    expect(json(await run(teamsVerbs.createTicket, { serviceId: 's2', title: 'A', description: 'B' }))).toContain('obavezan formular');
    expect(json(await run(teamsVerbs.createTicket, { serviceId: 's1', title: 'A', description: 'B' }, { ...config, ticketCreateEnabled: false }))).toContain('isključeno');
  });
});

describe('ticket creation helpers', () => {
  it('reads drafts and message payloads', () => {
    expect(readTicketDraft({ serviceId: 's', title: ' T ', description: 'D' })).toMatchObject({ title: 'T', impact: 'MEDIUM' });
    expect(readTicketDraft({ serviceId: 's', title: '', description: 'D' })).toBeNull();
    expect(messagePayloadText({ messagePayload: { body: { content: '<p>Štampač&nbsp;ne radi</p><br>hitno' }, linkToMessage: 'https://teams.microsoft.com/l/message/1' } })).toEqual({
      text: 'Štampač ne radi\n\nhitno',
      link: 'https://teams.microsoft.com/l/message/1',
    });
  });
  it('builds the form with typeahead and the submit mode', () => {
    const execute = ticketFormCard({ locale: 'en', services: [{ id: 's1', name: 'Network' }], publicUrl: null });
    expect(json(execute)).toContain('"choices.data":{"type":"Data.Query","dataset":"services"}');
    expect(json(execute)).toContain('Action.Execute');
    expect(json(ticketFormCard({ locale: 'en', services: [], publicUrl: null, submitMode: 'submit' }))).toContain('Action.Submit');
  });
  it('error mapping', () => {
    expect(teamsErrorTextKey(new TicketsError('TICKET_NOT_CLAIMABLE' as never))).toBe('errStale');
    expect(teamsErrorTextKey(new Error('boom'))).toBeNull();
  });
});
