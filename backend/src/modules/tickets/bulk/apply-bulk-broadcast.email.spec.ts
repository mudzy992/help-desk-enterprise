import { applyBulkBroadcast } from './apply-bulk-broadcast';
import { formatBulkBroadcastMessage } from './format-bulk-broadcast-message';
import { redactBroadcastText, scanBroadcastText } from './redact-bulk-broadcast';
import {
  clearBroadcastEmailSender,
  registerBroadcastEmailSender,
  type BroadcastEmailRequest,
} from './broadcast-email-channel';
import { defaultTicketBulkConfiguration } from './bulk.constants';

jest.mock('../../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('./audit-bulk-ticket-change', () => ({
  auditBulkTicketChange: jest.fn(async () => undefined),
  ticketChangeLogReasons: { bulkBroadcast: 'bulk' },
  ticketSystemEventActions: { ticketBulkBroadcast: 'ticket_bulk_broadcast' },
}));

async function broadcast(
  configuration: Partial<typeof defaultTicketBulkConfiguration>,
  whatHappened = 'Prekid u 18h',
) {
  const created: unknown[] = [];
  const messages: unknown[] = [];
  await applyBulkBroadcast({
    prisma: {
      ticketMessage: {
        create: async (args: { data: { body?: string } }) =>
          (created.push(args), { id: `msg-${created.length}`, ...args.data }),
      },
    } as never,
    actor: { actorUserId: `actor-${Math.random()}` } as never,
    tickets: [{ id: 't1', requesterId: 'r1', assignedUserId: null }] as never,
    body: { actionType: 'broadcast_message', whatHappened, previewConfirmed: true } as never,
    configuration: {
      ...defaultTicketBulkConfiguration,
      broadcastRequirePreview: false,
      broadcastStructuredEnabled: false,
      ...configuration,
    } as never,
    batchId: 'b1',
    messages: messages as never,
  });
  return { created, messages };
}

describe('applyBulkBroadcast — e-mail (paket 1.5)', () => {
  const requests: BroadcastEmailRequest[] = [];
  beforeEach(() => {
    requests.length = 0;
    registerBroadcastEmailSender(async (request) => void requests.push(request));
  });
  afterEach(() => clearBroadcastEmailSender());

  it('hands the text to the e-mail channel when in-app is off', async () => {
    const { created } = await broadcast({ broadcastEnableInApp: false, broadcastEnableEmail: true });
    expect(created).toEqual([]);
    expect(requests).toEqual([
      expect.objectContaining({ ticketId: 't1', batchId: 'b1', body: expect.stringContaining('Prekid u 18h') }),
    ]);
  });

  it('relies on the in-app reply (and its e-mail) when in-app is on', async () => {
    const { created } = await broadcast({ broadcastEnableInApp: true, broadcastEnableEmail: true });
    expect(created).toHaveLength(1);
    expect(requests).toEqual([]);
  });

  it('val 2 (M12/B2): redaktira uzorak tajne prije upisa i prije slanja', async () => {
    const secret = 'Prekid je uzrokovan lozinka: Tajna123!';
    const { created, messages } = await broadcast(
      { broadcastEnableInApp: true, broadcastEnableEmail: true },
      secret,
    );

    // Poruka u tiketu i e-mail nikad ne nose uzorak.
    const replies = (created as Array<{ data: { body: string } }>).filter((entry) =>
      entry.data.body.startsWith('What happened:'),
    );
    expect(replies).toHaveLength(1);
    expect(replies[0].data.body).not.toContain('Tajna123!');
    expect(replies[0].data.body).toContain('[REDACTED]');
    expect(replies[0].data.body).toContain('Prekid je uzrokovan');
    // Trag: sistemski događaj upozorenja na tiketu (kao kod svake druge poruke).
    expect(
      (messages as Array<{ body?: string }>).map((entry) => entry.body),
    ).toContain('ticket_redaction_warned:password_assignment');
  });

  it('val 2 (M12/B2): ne dira čist tekst i ne piše upozorenje', async () => {
    const { created, messages } = await broadcast({
      broadcastEnableInApp: true,
      broadcastEnableEmail: true,
    });
    expect((created[0] as { data: { body: string } }).data.body).toBe(
      formatBulkBroadcastMessage(
        { actionType: 'broadcast_message', whatHappened: 'Prekid u 18h', whoAffected: '', eta: '' } as never,
        {
          ...defaultTicketBulkConfiguration,
          broadcastRequirePreview: false,
          broadcastStructuredEnabled: false,
        } as never,
      ),
    );
    // Poruka ide u tiket, ali bez ijednog upozorenja o redakciji.
    expect(
      (messages as Array<{ body?: string }>).filter((entry) =>
        (entry.body ?? '').startsWith('ticket_redaction_warned'),
      ),
    ).toEqual([]);
    expect(scanBroadcastText('Prekid u 18h').matches).toEqual([]);
    expect(redactBroadcastText('Prekid u 18h')).toBe('Prekid u 18h');
  });
});
