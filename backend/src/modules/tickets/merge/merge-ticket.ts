import { PrismaService } from '../../../common/prisma/prisma.service';
import { permissionKeys } from '../../authorization/authorization.constants';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { redactSensitiveText } from '../redaction/redact-sensitive-text';
import type { TicketRedactionConfiguration } from '../redaction/redaction.types';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { applyTicketMerge } from './apply-ticket-merge';
import { assertMergeAllowed } from './assert-merge-allowed';
import { hasTicketPermission } from './has-ticket-permission';
import { normalizeRequiredReason } from './normalize-merge-reason';

/**
 * Package 1.2, M5 — `POST /tickets/:id/merge`: merges this ticket (the
 * child) into `parentTicketId`. The actor needs staff access to both tickets
 * and `ticket.merge`. Returns the updated child.
 */
export async function mergeTicket(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly redaction?: TicketRedactionConfiguration;
  readonly ticketId: string;
  readonly parentTicketId: string;
  readonly reason: string;
  readonly context: TicketMutationContext;
  readonly messages: TicketPersistedMessageSink;
}): Promise<{ readonly child: TicketRecord; readonly parent: TicketRecord }> {
  const authContext = await input.authorizationContextLoader.loadBySubjectId(
    input.context.actorUserId,
  );
  if (
    authContext === null ||
    !hasTicketPermission(authContext, permissionKeys.ticketMerge)
  ) {
    throw new TicketsError('FORBIDDEN');
  }
  const parentId = input.parentTicketId.trim();
  if (parentId === input.ticketId) {
    throw new TicketsError('MERGE_SELF');
  }
  const [child, parent] = await Promise.all(
    [input.ticketId, parentId].map((id) =>
      loadAccessibleTicket(
        input.prisma,
        input.authorizationContextLoader,
        id,
        input.context,
        { writable: true },
      ),
    ),
  );
  if (child.access.visibility !== 'staff' || parent.access.visibility !== 'staff') {
    throw new TicketsError('FORBIDDEN');
  }
  await assertMergeAllowed(input.prisma, parent.ticket, [child.ticket]);
  const normalized = normalizeRequiredReason(input.reason, 'MERGE_REASON_REQUIRED');
  const [merged] = await applyTicketMerge({
    prisma: input.prisma,
    parent: parent.ticket,
    children: [child.ticket],
    reason:
      input.redaction === undefined
        ? normalized
        : redactSensitiveText(normalized, input.redaction),
    context: input.context,
    redaction: input.redaction,
    messages: input.messages,
  });
  return { child: merged, parent: parent.ticket };
}
