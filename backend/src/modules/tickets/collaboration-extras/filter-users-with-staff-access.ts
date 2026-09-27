import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import type { TicketConfidentialConfiguration } from '../confidential/confidential.types';
import { resolveTicketActorAccess } from '../resolve-ticket-actor-access';
import type { TicketRecord } from '../tickets.types';

/**
 * Paket 2.4: which of `userIds` can see the ticket as staff (the same rules as
 * opening it: scope, confidential access, participants — FOLLOWER excluded).
 * Used for mention candidates, mention validation, follower notifications and
 * link masking. One authorization context per user; lists are short (≤ 50).
 */
export async function filterUsersWithStaffAccess(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  input: {
    readonly ticket: TicketRecord;
    readonly userIds: readonly string[];
    readonly confidential: TicketConfidentialConfiguration | undefined;
  },
): Promise<readonly string[]> {
  if (input.userIds.length === 0) {
    return [];
  }
  const originUnitPath = await loadOrganizationalUnitPath(prisma, input.ticket.originUnitId);
  if (originUnitPath === null) {
    return [];
  }
  const allowed: string[] = [];
  for (const userId of new Set(input.userIds)) {
    try {
      const context = await authorizationContextLoader.loadBySubjectId(userId);
      if (context === null) {
        continue;
      }
      const access = await resolveTicketActorAccess(prisma, {
        context,
        ticket: input.ticket,
        originUnitPath,
        confidential: input.confidential,
      });
      if (access.visibility === 'staff') {
        allowed.push(userId);
      }
    } catch {
      // No access (FORBIDDEN / NOT_FOUND / confidential): not allowed.
    }
  }
  return allowed;
}
