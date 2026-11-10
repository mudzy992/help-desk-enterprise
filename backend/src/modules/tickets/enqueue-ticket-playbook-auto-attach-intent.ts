import type { Prisma } from '../../generated/prisma/client';
import type { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { ticketPlaybookAutoAttachTopic } from './ticket-side-effect-outbox.constants';

/** Persist the post-create auto-attach intent in the ticket's own transaction. */
export function enqueueTicketPlaybookAutoAttachIntent(
  outbox: TransactionalOutboxService,
  transaction: Prisma.TransactionClient,
  ticketId: string,
): Promise<{ readonly id: string; readonly created: boolean }> {
  return outbox.enqueue(transaction, {
    topic: ticketPlaybookAutoAttachTopic,
    dedupeKey: ticketId,
    payload: { ticketId },
  });
}
