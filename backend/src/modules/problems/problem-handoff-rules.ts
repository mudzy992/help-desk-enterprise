import { PrismaService } from '../../common/prisma/prisma.service';
import { ProblemError, problemErrorCodes } from './problems.constants';

/** `child` is the same organizational unit as `parent` or lives below it. */
export function isOrganizationalUnitUnder(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

/**
 * W7.28 / BA-problems-10: a problem lives in the unit tree of the group that
 * runs it. A plain update may still move the unit inside that tree (data
 * corrections), but a move into another tree means the problem changes hands
 * and has to go through the handoff command.
 */
export async function assertUnitFollowsGroup(
  prisma: PrismaService,
  groupId: string | null,
  organizationalUnitId: string,
): Promise<void> {
  const unit = await prisma.organizationalUnit.findUnique({
    where: { id: organizationalUnitId },
    select: { ouPath: true },
  });
  if (unit === null) throw new ProblemError(problemErrorCodes.unitNotFound);
  if (groupId === null) throw new ProblemError(problemErrorCodes.handoffRequired, 'organizationalUnitId');
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { organizationalUnit: { select: { ouPath: true } } },
  });
  if (group === null) throw new ProblemError(problemErrorCodes.groupNotFound);
  if (!isOrganizationalUnitUnder(group.organizationalUnit.ouPath, unit.ouPath)) {
    throw new ProblemError(problemErrorCodes.handoffRequired, 'organizationalUnitId');
  }
}
