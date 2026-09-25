import { applyBulkBroadcast } from './apply-bulk-broadcast';
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

async function broadcast(configuration: Partial<typeof defaultTicketBulkConfiguration>) {
  const created: unknown[] = [];
  await applyBulkBroadcast({
    prisma: { ticketMessage: { create: async (args: unknown) => (created.push(args), {}) } } as never,
    actor: { actorUserId: `actor-${Math.random()}` } as never,
    tickets: [{ id: 't1', requesterId: 'r1', assignedUserId: null }] as never,
    body: { actionType: 'broadcast_message', whatHappened: 'Prekid u 18h', previewConfirmed: true } as never,
    configuration: {
      ...defaultTicketBulkConfiguration,
      broadcastRequirePreview: false,
      broadcastStructuredEnabled: false,
      ...configuration,
    } as never,
    batchId: 'b1',
    messages: [] as never,
  });
  return created;
}

describe('applyBulkBroadcast — e-mail (paket 1.5)', () => {
  const requests: BroadcastEmailRequest[] = [];
  beforeEach(() => {
    requests.length = 0;
    registerBroadcastEmailSender(async (request) => void requests.push(request));
  });
  afterEach(() => clearBroadcastEmailSender());

  it('hands the text to the e-mail channel when in-app is off', async () => {
    const created = await broadcast({ broadcastEnableInApp: false, broadcastEnableEmail: true });
    expect(created).toEqual([]);
    expect(requests).toEqual([
      expect.objectContaining({ ticketId: 't1', batchId: 'b1', body: expect.stringContaining('Prekid u 18h') }),
    ]);
  });

  it('relies on the in-app reply (and its e-mail) when in-app is on', async () => {
    const created = await broadcast({ broadcastEnableInApp: true, broadcastEnableEmail: true });
    expect(created).toHaveLength(1);
    expect(requests).toEqual([]);
  });
});
