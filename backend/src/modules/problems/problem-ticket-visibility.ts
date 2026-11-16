import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { buildTicketSurfaceVisibility } from '../tickets/list/build-ticket-surface-visibility';
import { loadTicketVisibilityInputs } from '../tickets/list/load-ticket-visibility-inputs';
import { TicketAccessPolicyBinder } from '../tickets/ticket-access-policy-binder';
import { ProblemError, problemErrorCodes } from './problems.constants';

/** Use the ticket list policy before limiting, counting or deriving ticket data. */
export async function problemTicketVisibility(
  prisma: PrismaService,
  loader: AuthorizationContextLoader,
  policies: TicketAccessPolicyBinder,
  userId: string,
): Promise<Prisma.TicketWhereInput> {
  const [context, gated] = await Promise.all([
    loader.loadBySubjectId(userId),
    policies.bind({ actorUserId: userId }),
  ]);
  if (context === null) throw new ProblemError(problemErrorCodes.forbidden);
  const configuration = gated.confidential;
  const inputs = await loadTicketVisibilityInputs(prisma, userId, {
    includeActorGroupIds: configuration.enabled && configuration.allowedViewerGroupIds.length > 0,
  });
  return buildTicketSurfaceVisibility({
    surface: 'list',
    visibility: { context, ...inputs, actorMembershipUserId: userId, configuration, now: new Date() },
  })!;
}
