import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { hasTicketStaffRole } from '../authorize-ticket-actor';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import type {
  ForwardTargetAgent,
  TicketForwardingConfiguration,
} from './forwarding.types';
import { listForwardTargets } from './list-forward-targets';

/**
 * Agents of a target group the forward may go straight to
 * (`GET /tickets/:id/forward-targets/:groupId/agents`). Only groups the actor
 * may forward to are answered, so the member list of another OU's group is
 * not exposed to someone without cross-OU rights. Eligibility is the same as
 * in `planTicketForward`: a group member holding a staff role.
 */
export async function listForwardTargetAgents(input: {
  readonly prisma: PrismaService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly configuration: TicketForwardingConfiguration;
  readonly ticketId: string;
  readonly groupId: string;
  readonly context: TicketMutationContext;
}): Promise<readonly ForwardTargetAgent[]> {
  const targets = await listForwardTargets(input);
  if (!targets.groups.some((group) => group.id === input.groupId)) {
    throw new TicketsError('HANDLER_GROUP_NOT_FOUND');
  }
  const members = (await input.prisma.groupMember.findMany({
    where: { groupId: input.groupId },
    select: { userId: true },
  })) as { userId: string }[];
  const eligible: string[] = [];
  for (const member of members) {
    const context = await input.authorizationContextLoader.loadBySubjectId(
      member.userId,
    );
    if (context !== null && hasTicketStaffRole(context)) {
      eligible.push(member.userId);
    }
  }
  if (eligible.length === 0) {
    return [];
  }
  const users = (await input.prisma.user.findMany({
    where: { id: { in: eligible } },
    select: { id: true, displayName: true },
  })) as { id: string; displayName?: string | null }[];
  const names = new Map(users.map((user) => [user.id, user.displayName ?? null]));
  return eligible
    .map((id) => ({ id, displayName: names.get(id) ?? id }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'bs'));
}
