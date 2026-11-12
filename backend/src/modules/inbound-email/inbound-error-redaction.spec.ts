import { Logger } from '@nestjs/common';
import { InboundEmailService } from './inbound-email.service';
import { inboundErrorCodes } from './inbound-error-code';

jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../tickets/tickets.service', () => ({ TicketsService: class TicketsService {} }));
jest.mock('../tickets/tickets-collaboration.service', () => ({ TicketsCollaborationService: class TicketsCollaborationService {} }));
jest.mock('../tickets/attachments/tickets-attachments.service', () => ({ TicketsAttachmentsService: class TicketsAttachmentsService {} }));
jest.mock('../tickets/reopen/tickets-reopen.service', () => ({ TicketsReopenService: class TicketsReopenService {} }));

describe('inbound mailbox failure redaction', () => {
  it('stores, returns and logs a stable code instead of provider text', async () => {
    const upsert = jest.fn().mockResolvedValue({ consecutiveFails: 1, alertedAt: null });
    const service = new InboundEmailService(
      { inboundMailboxState: { upsert } } as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    const sensitive = 'user@example.test token=secret provider response';
    const connectorSeam = service as unknown as { createConnector: () => { open: () => Promise<never> } };
    jest.spyOn(connectorSeam, 'createConnector').mockReturnValue({
      open: jest.fn().mockRejectedValue(new Error(sensitive)),
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    try {
      const result = await service.runOnce({ provider: 'imap', address: 'mailbox@example.test' } as never);
      expect(result).toEqual({ kind: 'failed', error: inboundErrorCodes.mailboxFailure });
      expect(JSON.stringify(upsert.mock.calls)).not.toContain(sensitive);
      expect(upsert.mock.calls[0][0].create.lastError).toBe(inboundErrorCodes.mailboxFailure);
      expect(JSON.stringify(warn.mock.calls)).not.toContain('example.test');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
    } finally {
      warn.mockRestore();
    }
  });
});
