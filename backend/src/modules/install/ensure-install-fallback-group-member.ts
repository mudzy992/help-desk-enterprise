import type { PrismaService } from '../../common/prisma/prisma.service';
import { addGroupMember } from '../groups/add-group-member';
import type { PrincipalInvalidationHook } from '../groups/groups.types';

/**
 * Install wizard v2 (F0.6): the seed created a fallback group with **no
 * members**, so readiness (`handlerGroup` — overview §3) could never go green
 * and a routed newcomer ticket landed in a group nobody belonged to.
 *
 * The membership itself is added through the very same domain function the
 * `POST /groups/:groupId/members/:userId` endpoint uses (`addGroupMember`), so
 * the audit entry, the principal invalidation and the "already a member" rule
 * stay in one place; this wrapper only makes the seed call idempotent.
 */
export async function ensureInstallFallbackGroupMember(
  prisma: PrismaService,
  input: {
    readonly groupId: string;
    readonly userId: string;
    readonly requestId?: string | null;
    readonly invalidatePrincipal?: PrincipalInvalidationHook;
  },
): Promise<{ readonly created: boolean }> {
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
    select: { id: true },
  });
  if (existing !== null) {
    return { created: false };
  }
  await addGroupMember(
    prisma,
    input.groupId,
    input.userId,
    input.invalidatePrincipal,
    { actorUserId: input.userId, requestId: input.requestId ?? null },
  );
  return { created: true };
}
