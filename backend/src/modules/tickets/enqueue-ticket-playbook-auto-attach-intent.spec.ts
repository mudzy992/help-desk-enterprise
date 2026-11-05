import { ticketPlaybookAutoAttachTopic } from './ticket-side-effect-outbox.constants';
import { enqueueTicketPlaybookAutoAttachIntent } from './enqueue-ticket-playbook-auto-attach-intent';

describe('enqueueTicketPlaybookAutoAttachIntent', () => {
  it('uses the ticket id as a stable dedupe key and payload', async () => {
    const transaction = {};
    const outbox = { enqueue: jest.fn().mockResolvedValue({ id: 'outbox-1', created: true }) };

    await expect(
      enqueueTicketPlaybookAutoAttachIntent(outbox as never, transaction as never, 'ticket-12345678'),
    ).resolves.toEqual({ id: 'outbox-1', created: true });

    expect(outbox.enqueue).toHaveBeenCalledWith(transaction, {
      topic: ticketPlaybookAutoAttachTopic,
      dedupeKey: 'ticket-12345678',
      payload: { ticketId: 'ticket-12345678' },
    });
  });
});
