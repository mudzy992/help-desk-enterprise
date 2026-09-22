import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { TicketAssignmentConfigurationLoader } from '../tickets/assignment/ticket-assignment-configuration.loader';
import { resolveEffectiveAutoAssignStrategy } from '../tickets/assignment/resolve-effective-auto-assign-strategy';
import type { AutoAssignStrategy } from '../../generated/prisma/enums';
import { GroupsError } from './groups.error';
import type { MyGroupResponse } from './groups.types';

const myGroupSelect = {
  id: true,
  name: true,
  isFallback: true,
  autoAssignStrategy: true,
  organizationalUnit: { select: { id: true, name: true, ouPath: true } },
  _count: { select: { members: true } },
} as const;

/**
 * The groups a person belongs to (SuperAdmin: every group), each with the
 * auto-assign strategy that actually applies to a ticket handed to it. Global
 * auto-assign is loaded once; a disabled global setting makes every group's
 * `effectiveAutoAssign` NONE, matching what ticket assignment does.
 */
export async function listMyGroups(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configurationLoader: TicketAssignmentConfigurationLoader,
  actorUserId: string,
): Promise<readonly MyGroupResponse[]> {
  const authContext =
    await authorizationContextLoader.loadBySubjectId(actorUserId);
  if (authContext === null) {
    throw new GroupsError('FORBIDDEN');
  }
  const configuration = await configurationLoader.load();
  const groups = await prisma.group.findMany({
    where: authContext.isSuperAdmin
      ? undefined
      : { members: { some: { userId: actorUserId } } },
    select: myGroupSelect,
    orderBy: [{ organizationalUnit: { ouPath: 'asc' } }, { name: 'asc' }],
  });
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    organizationalUnit: {
      id: group.organizationalUnit.id,
      name: group.organizationalUnit.name,
      path: group.organizationalUnit.ouPath,
    },
    memberCount: group._count.members,
    effectiveAutoAssign: resolveEffectiveAutoAssignStrategy({
      configuration,
      // A group serves more than one service through routing rules, so its
      // own strategy is what "effective" can mean without a specific ticket;
      // the service level only applies once a ticket is actually routed.
      serviceStrategy: null,
      groupStrategy: group.autoAssignStrategy as AutoAssignStrategy,
    }),
    isFallback: group.isFallback,
  }));
}
