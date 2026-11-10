import { InboundEmailService } from './inbound-email.service';
import type { InboundMailboxItem, InboundMailboxSession } from './mailbox/inbound-mailbox';
import type { InboundOutcome } from './inbound-email.types';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../tickets/tickets.service', () => ({
  TicketsService: class TicketsService {},
}));
jest.mock('../tickets/tickets-collaboration.service', () => ({
  TicketsCollaborationService: class TicketsCollaborationService {},
}));
jest.mock('../tickets/attachments/tickets-attachments.service', () => ({
  TicketsAttachmentsService: class TicketsAttachmentsService {},
}));
jest.mock('../tickets/reopen/tickets-reopen.service', () => ({
  TicketsReopenService: class TicketsReopenService {},
}));

describe('InboundEmailService.finish duplicate collision (BA-inbound-email-07)', () => {
  it('converts a PROCESSED unique collision into IGNORED/DUPLICATE', async () => {
    const updateMany = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
      .mockResolvedValueOnce({ count: 1 });
    const service = new InboundEmailService(
      { inboundEmail: { updateMany } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const session = {
      list: jest.fn(),
      listIds: jest.fn(),
      move: jest.fn().mockResolvedValue(undefined),
      close: jest.fn(),
    } as unknown as InboundMailboxSession;
    const item: InboundMailboxItem = { providerMessageId: 'provider-1', raw: Buffer.alloc(0) };
    const finish = (service as unknown as {
      finish: (s: InboundMailboxSession, i: InboundMailboxItem, id: string, owner: string, o: InboundOutcome) => Promise<string>;
    }).finish.bind(service);

    await expect(
      finish(session, item, 'inbound-1', 'owner-1', { status: 'PROCESSED', ticketId: 'ticket-1' }),
    ).resolves.toBe('IGNORED');

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[1]?.[0]?.data).toMatchObject({
      status: 'IGNORED',
      reason: 'DUPLICATE',
    });
    expect(session.move).toHaveBeenCalledWith('provider-1', 'rejected');
  });
});
