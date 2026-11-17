import type { PrismaService } from '../../common/prisma/prisma.service';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import {
  assetViewerFromContext,
  isPathInScope,
  resolveAssetScope,
  viewerHasPermission,
  type AssetViewer,
} from '../assets/asset-viewer';
import { permissionKeys } from '../authorization/authorization.constants';
import { TicketsError } from './tickets.error';

/** Permissions the problem resolution itself needs before it may delegate a ticket write. */
const delegationPermissions = [permissionKeys.problemRead, permissionKeys.problemManage, permissionKeys.problemClose];

type DelegationViewer = AssetViewer;

async function assertProblemScope(prisma: PrismaService, viewer: DelegationViewer, problemPath: string | null): Promise<void> {
  const home = viewer.homeOrganizationalUnitId === null
    ? null
    : await prisma.organizationalUnit.findUnique({
        where: { id: viewer.homeOrganizationalUnitId },
        select: { ouPath: true },
      });
  for (const permission of delegationPermissions) {
    if (!isPathInScope(resolveAssetScope(viewer, permission, home?.ouPath ?? null), problemPath)) {
      throw new TicketsError('FORBIDDEN');
    }
  }
}

/**
 * BA-problems-05 (W7.23): `problem.close` is a delegation over the tickets that
 * are linked to that one problem — not a role-wide ticket bypass. The problem
 * resolution passes `problemDelegation` in a server-only context, but the write
 * path revalidates it per ticket: the link must still exist, the problem must
 * still be RESOLVED, and the actor must currently hold the problem permissions
 * in the problem's OU plus authority in the problem group. A revoked role,
 * group membership, moved OU, unlinked ticket or reopened problem fails closed.
 *
 * Confidential tickets are never covered by the delegation; callers fall back
 * to the regular ticket/confidential access check for them.
 */
export async function assertProblemDelegation(
  prisma: PrismaService,
  input: { readonly problemId: string; readonly ticketId: string; readonly actorUserId: string },
): Promise<void> {
  const link = await prisma.problemTicket.count({
    where: { problemId: input.problemId, ticketId: input.ticketId },
  });
  if (link === 0) throw new TicketsError('FORBIDDEN');
  const problem = await prisma.problem.findUnique({
    where: { id: input.problemId },
    select: { status: true, groupId: true, organizationalUnit: { select: { ouPath: true } } },
  });
  if (problem === null || problem.status !== 'RESOLVED') throw new TicketsError('FORBIDDEN');
  const principal = await loadPrincipalContext(prisma, input.actorUserId);
  if (principal === null || !principal.isActive) throw new TicketsError('FORBIDDEN');
  const viewer = assetViewerFromContext(principal, input.actorUserId, 'problem.');
  for (const permission of delegationPermissions) {
    if (!viewerHasPermission(viewer, permission)) throw new TicketsError('FORBIDDEN');
  }
  await assertProblemScope(prisma, viewer, problem.organizationalUnit?.ouPath ?? null);
  if (viewer.isSuperAdmin || viewer.isAdmin === true) return;
  if (problem.groupId === null) throw new TicketsError('FORBIDDEN');
  const member = await prisma.groupMember.count({
    where: { groupId: problem.groupId, userId: input.actorUserId },
  });
  if (member === 0) throw new TicketsError('FORBIDDEN');
}
