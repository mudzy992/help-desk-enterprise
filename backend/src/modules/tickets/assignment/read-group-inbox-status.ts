import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import { resolveInboxGroupWhere } from './resolve-inbox-group-where';
import { TicketAssignmentConfigurationLoader } from './ticket-assignment-configuration.loader';

export type GroupInboxStatus = {
  readonly hasGroupMembership: boolean;
};

export async function readGroupInboxStatus(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configurationLoader: TicketAssignmentConfigurationLoader,
  context: TicketMutationContext,
): Promise<GroupInboxStatus> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const configuration = await configurationLoader.load();
  if (!configuration.groupInboxEnabled) {
    throw new TicketsError('GROUP_INBOX_DISABLED');
  }
  const assignedGroupId = await resolveInboxGroupWhere(prisma, authContext);
  return { hasGroupMembership: assignedGroupId !== null };
}
